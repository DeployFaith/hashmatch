import { existsSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { MatchEvent } from "@/contract/types";
import { isSafeMatchId } from "@/engine/matchId";
import { redactEvent, type MatchPhase, type ModeProfile } from "@/lib/redaction";
import type { MatchSummaryRecord } from "@/lib/matches/types";
import {
  readMatchStatus,
  resolveMatchDir,
  writeMatchStatusAtomic,
  type MatchLifecycleStatusRecord,
} from "@/server/matchLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SSE_CADENCE_MS = 300;
const DEFAULT_TAIL_POLL_MS = 500;
const STATUS_INTERVAL_MS = 2_000;
const STATUS_EVENT_BATCH = 5;
const BROADCAST_MATCH_PHASE: MatchPhase = "live";

type MatchCompletePayload = {
  status: "finished";
  verified: boolean;
  finalScores: Record<string, number>;
};

interface StreamContext {
  controller: ReadableStreamDefaultController<Uint8Array>;
  signal: AbortSignal;
  encoder: TextEncoder;
}

function parseLastEventId(request: Request): number | null {
  const raw = request.headers.get("last-event-id");
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCadenceMs(): number {
  const parsed = Number.parseInt(process.env.HASHMATCH_SSE_CADENCE_MS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_SSE_CADENCE_MS;
}

function resolveTailPollMs(): number {
  const parsed = Number.parseInt(process.env.HASHMATCH_TAIL_POLL_MS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TAIL_POLL_MS;
}

function serializeSseEvent({
  event,
  data,
  id,
}: {
  event: string;
  data: unknown;
  id?: string | number;
}): string {
  const lines = [] as string[];
  if (id !== undefined) {
    lines.push(`id: ${id}`);
  }
  lines.push(`event: ${event}`);
  const payload = JSON.stringify(data);
  for (const line of payload.split("\n")) {
    lines.push(`data: ${line}`);
  }
  return `${lines.join("\n")}\n\n`;
}

const closedSseControllers = new WeakSet<ReadableStreamDefaultController<Uint8Array>>();

function closeStream(ctx: StreamContext): void {
  if (closedSseControllers.has(ctx.controller)) {
    return;
  }
  closedSseControllers.add(ctx.controller);
  try {
    ctx.controller.close();
  } catch {
    // ignore
  }
}

function enqueueEvent(
  ctx: StreamContext,
  event: string,
  data: unknown,
  id?: string | number,
): void {
  if (ctx.signal.aborted) {
    return;
  }
  if (closedSseControllers.has(ctx.controller)) {
    return;
  }
  try {
    ctx.controller.enqueue(ctx.encoder.encode(serializeSseEvent({ event, data, id })));
  } catch (err: any) {
    if (err?.code === "ERR_INVALID_STATE") {
      closedSseControllers.add(ctx.controller);
      return;
    }
    throw err;
  }
}

async function readModeProfile(matchDir: string): Promise<ModeProfile | null> {
  const candidates = ["match_manifest.json", "match_summary.json"];
  for (const filename of candidates) {
    try {
      const raw = await readFile(join(matchDir, filename), "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const modeProfile = parsed.modeProfile as ModeProfile | undefined;
      if (modeProfile && typeof modeProfile === "object") {
        return modeProfile;
      }
    } catch {
      // ignore missing/invalid files
    }
  }
  return null;
}

function parseJsonLine(line: string): MatchEvent | null {
  try {
    return JSON.parse(line) as MatchEvent;
  } catch {
    return null;
  }
}

async function readNewChunk(
  filePath: string,
  offset: number,
): Promise<{ data: string; offset: number }> {
  const handle = await open(filePath, "r");
  try {
    const stats = await handle.stat();
    if (stats.size <= offset) {
      return { data: "", offset };
    }
    const length = stats.size - offset;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    return { data: buffer.toString("utf-8"), offset: stats.size };
  } finally {
    await handle.close();
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMatchStatusPayload(status: MatchLifecycleStatusRecord): {
  status: MatchLifecycleStatusRecord["status"];
  turn: number | null;
  totalTurns: number;
} {
  return {
    status: status.status,
    turn: status.currentTurn,
    totalTurns: status.totalTurns,
  };
}

async function resolveFinalScores(
  matchDir: string,
  fallback: Record<string, number> | null,
): Promise<Record<string, number>> {
  try {
    const raw = await readFile(join(matchDir, "match_summary.json"), "utf-8");
    const parsed = JSON.parse(raw) as MatchSummaryRecord;
    if (parsed && typeof parsed === "object" && parsed.scores && typeof parsed.scores === "object") {
      const scores: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed.scores)) {
        if (typeof value === "number") {
          scores[key] = value;
        }
      }
      return scores;
    }
  } catch {
    // ignore
  }
  return fallback ?? {};
}

async function updateCurrentTurn(
  matchDir: string,
  status: MatchLifecycleStatusRecord,
  turn: number | null,
): Promise<MatchLifecycleStatusRecord> {
  if (turn === null || turn === status.currentTurn) {
    return status;
  }
  const updated: MatchLifecycleStatusRecord = {
    ...status,
    currentTurn: turn,
  };
  await writeMatchStatusAtomic(matchDir, updated);
  return updated;
}

async function streamMatchEvents(
  ctx: StreamContext,
  matchDir: string,
  initialStatus: MatchLifecycleStatusRecord,
  lastEventId: number | null,
): Promise<void> {
  const matchLogPath = join(matchDir, "match.jsonl");
  const cadenceMs = resolveCadenceMs();
  const tailPollMs = resolveTailPollMs();
  const modeProfile = await readModeProfile(matchDir);

  let currentStatus = initialStatus;
  let lastStatusSentAt = 0;
  let eventsSinceStatus = 0;
  let lastEmitAt = 0;
  let pendingComplete = currentStatus.status === "finished";
  let logFinalized = false;
  let lastMatchEndedScores: Record<string, number> | null = null;

  const eventQueue: MatchEvent[] = [];

  const sendStatus = () => {
    enqueueEvent(ctx, "match_status", buildMatchStatusPayload(currentStatus), "status");
    lastStatusSentAt = Date.now();
    eventsSinceStatus = 0;
  };

  sendStatus();

  let logOffset = 0;
  let buffered = "";

  const enqueueParsedEvent = async (parsed: MatchEvent) => {
    if (lastEventId !== null && parsed.seq <= lastEventId) {
      return;
    }
    const redacted = redactEvent(parsed, modeProfile, BROADCAST_MATCH_PHASE) as MatchEvent;
    eventQueue.push(redacted);
    const parsedTurn =
      "turn" in parsed && typeof parsed.turn === "number" ? parsed.turn : null;
    if (parsedTurn !== null) {
      currentStatus = await updateCurrentTurn(matchDir, currentStatus, parsedTurn);
    }
    if (parsed.type === "MatchEnded") {
      lastMatchEndedScores = parsed.scores ?? null;
    }
  };

  if (existsSync(matchLogPath)) {
    const raw = await readFile(matchLogPath);
    logOffset = raw.length;
    const text = raw.toString("utf-8");
    const lines = text.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      buffered = lines.pop() ?? "";
    } else if (lines.length > 0) {
      lines.pop();
    }
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const parsed = parseJsonLine(line);
      if (!parsed) {
        continue;
      }
      await enqueueParsedEvent(parsed);
    }
  }

  const statusTimer = setInterval(() => {
    if (ctx.signal.aborted || closedSseControllers.has(ctx.controller)) {
      return;
    }
    const now = Date.now();
    if (now - lastStatusSentAt >= STATUS_INTERVAL_MS) {
      sendStatus();
    }
  }, 200);

  const emitLoop = async () => {
    while (!ctx.signal.aborted) {
      if (eventQueue.length === 0) {
        if (pendingComplete && logFinalized) {
          const finalScores = await resolveFinalScores(matchDir, lastMatchEndedScores);
          const payload: MatchCompletePayload = {
            status: "finished",
            verified: currentStatus.verified ?? false,
            finalScores,
          };
          enqueueEvent(ctx, "match_complete", payload, "done");
          closeStream(ctx);
          return;
        }
        await delay(20);
        continue;
      }

      const now = Date.now();
      const wait = Math.max(0, cadenceMs - (now - lastEmitAt));
      if (wait > 0) {
        await delay(wait);
      }
      if (ctx.signal.aborted) {
        break;
      }
      const next = eventQueue.shift();
      if (!next) {
        continue;
      }
      enqueueEvent(ctx, "match_event", next, next.seq);
      lastEmitAt = Date.now();
      eventsSinceStatus += 1;
      if (eventsSinceStatus >= STATUS_EVENT_BATCH) {
        sendStatus();
      }
    }
  };

  const tailLoop = async () => {
    while (!ctx.signal.aborted && !logFinalized) {
      if (existsSync(matchLogPath)) {
        const chunk = await readNewChunk(matchLogPath, logOffset);
        logOffset = chunk.offset;
        if (chunk.data) {
          buffered += chunk.data;
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }
            const parsed = parseJsonLine(line);
            if (!parsed) {
              continue;
            }
            await enqueueParsedEvent(parsed);
          }
        }
      }

      const updatedStatus = await readMatchStatus(matchDir);
      if (!updatedStatus) {
        closeStream(ctx);
        return;
      }
      currentStatus = updatedStatus;
      if (updatedStatus.status === "finished") {
        pendingComplete = true;
      }

      if (pendingComplete && !buffered) {
        const finalChunk = existsSync(matchLogPath)
          ? await readNewChunk(matchLogPath, logOffset)
          : { data: "", offset: logOffset };
        logOffset = finalChunk.offset;
        if (!finalChunk.data) {
          logFinalized = true;
          break;
        }
        buffered += finalChunk.data;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          const parsed = parseJsonLine(line);
          if (!parsed) {
            continue;
          }
          await enqueueParsedEvent(parsed);
        }
      }

      await delay(tailPollMs);
    }
  };

  try {
    await Promise.all([emitLoop(), tailLoop()]);
  } finally {
    clearInterval(statusTimer);
  }
}

type RouteContext = { params: Promise<{ matchId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { matchId } = await context.params;
  if (!isSafeMatchId(matchId)) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const matchDir = resolveMatchDir(matchId);
  if (!existsSync(matchDir)) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const status = await readMatchStatus(matchDir);
  if (!status) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const ctx: StreamContext = { controller, signal: request.signal, encoder };

      if (request.signal.aborted) {
        closeStream(ctx);
        return;
      }

      const abortListener = () => {
        closeStream(ctx);
      };
      request.signal.addEventListener("abort", abortListener, { once: true });

      void streamMatchEvents(ctx, matchDir, status, parseLastEventId(request)).catch(() => {
        if (!request.signal.aborted) {
          closeStream(ctx);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
