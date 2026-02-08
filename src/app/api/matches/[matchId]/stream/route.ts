import { existsSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isSafeMatchId } from "@/engine/matchId";
import type { MatchEvent } from "@/contract/types";
import { redactEvent, type MatchPhase, type ModeProfile } from "@/lib/redaction";
import { getMatchDirectory } from "@/server/matchStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 15_000;
const TAIL_POLL_INTERVAL_MS = 300;
const STATUS_POLL_INTERVAL_MS = 1_000;
const BROADCAST_MATCH_PHASE: MatchPhase = "live";

type MatchStatusState =
  | "running"
  | "complete"
  | "incomplete"
  | "failed"
  | "completed"
  | "crashed";
interface MatchStatus {
  status: MatchStatusState;
  startedAt: string;
  endedAt?: string;
  finishedAt?: string;
  error?: string;
}

interface StreamContext {
  controller: ReadableStreamDefaultController<Uint8Array>;
  signal: AbortSignal;
  encoder: TextEncoder;
}

function parseIncludeParams(request: Request): Set<string> {
  const includes = new Set<string>();
  const { searchParams } = new URL(request.url);
  for (const value of searchParams.getAll("include")) {
    for (const token of value.split(",")) {
      const trimmed = token.trim();
      if (trimmed) {
        includes.add(trimmed);
      }
    }
  }
  return includes;
}

function parseLastEventId(request: Request): number | null {
  const raw = request.headers.get("last-event-id");
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
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

// Prevent races between background poll/heartbeat ticks and stream closure.
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

function enqueueEvent(ctx: StreamContext, event: string, data: unknown, id?: string | number): void {
  if (ctx.signal.aborted) {
    return;
  }
  if (closedSseControllers.has(ctx.controller)) {
    return;
  }
  try {
    ctx.controller.enqueue(ctx.encoder.encode(serializeSseEvent({ event, data, id })));
  } catch (err: any) {
    // If something closed the controller between our checks and enqueue, stop quietly.
    if (err?.code === "ERR_INVALID_STATE") {
      closedSseControllers.add(ctx.controller);
      return;
    }
    throw err;
  }
}
async function readMatchStatus(statusPath: string): Promise<MatchStatus | null> {
  try {
    const raw = await readFile(statusPath, "utf-8");
    return JSON.parse(raw) as MatchStatus;
  } catch {
    return null;
  }
}

async function readMoments(matchDir: string): Promise<unknown[]> {
  try {
    const raw = await readFile(join(matchDir, "moments.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

function parseJsonLine(line: string): MatchEvent {
  return JSON.parse(line) as MatchEvent;
}

async function readNewChunk(filePath: string, offset: number): Promise<{ data: string; offset: number }> {
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

function shouldSkipEvent(event: MatchEvent, lastEventId: number | null): boolean {
  if (lastEventId === null) {
    return false;
  }
  return event.seq <= lastEventId;
}

async function streamMatchEvents(
  ctx: StreamContext,
  matchDir: string,
  lastEventId: number | null,
  includeMoments: boolean,
): Promise<void> {
  const statusPath = join(matchDir, "match_status.json");
  let status = await readMatchStatus(statusPath);
  if (!status) {
    enqueueEvent(ctx, "error", { message: "Missing match_status.json" });
    closeStream(ctx);
    return;
  }

  if (includeMoments) {
    const moments = await readMoments(matchDir);
    enqueueEvent(ctx, "moments", moments);
  }

  const modeProfile = await readModeProfile(matchDir);
  const matchLogPath = join(matchDir, "match.jsonl");
  let logOffset = 0;
  let buffered = "";
  let hadAnyEvents = false;
  let sentWaiting = false;
  let lastHeartbeat = Date.now();

  enqueueEvent(ctx, "verification", { status: "unknown" });

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
      let parsed: MatchEvent;
      try {
        parsed = parseJsonLine(line);
      } catch {
        enqueueEvent(ctx, "error", { message: "Failed to parse match.jsonl" });
        closeStream(ctx);
        return;
      }
      if (shouldSkipEvent(parsed, lastEventId)) {
        continue;
      }
      const redacted = redactEvent(parsed, modeProfile, BROADCAST_MATCH_PHASE) as MatchEvent | null;
      if (redacted) {
        enqueueEvent(ctx, "match_event", redacted, redacted.seq);
        hadAnyEvents = true;
      }
    }
  }

  const logExists = existsSync(matchLogPath);
  const logIsEmpty = logExists ? logOffset === 0 : true;
  if (status.status === "running" && logIsEmpty) {
    enqueueEvent(ctx, "waiting", { status: "running" });
    sentWaiting = true;
  }

  if (status.status !== "running") {
    const endedAt = status.finishedAt ?? status.endedAt ?? null;
    if (status.status === "complete" || status.status === "completed") {
      enqueueEvent(ctx, "match_end", { status: status.status, endedAt });
    } else {
      enqueueEvent(ctx, "error", { status: status.status, error: status.error ?? null });
    }
    closeStream(ctx);
    return;
  }

  let lastStatusCheck = Date.now();
  while (!ctx.signal.aborted) {
    const now = Date.now();
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      enqueueEvent(ctx, "heartbeat", { ts: new Date().toISOString() });
      lastHeartbeat = now;
    }

    if (existsSync(matchLogPath)) {
      try {
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
            let parsed: MatchEvent;
            try {
              parsed = parseJsonLine(line);
            } catch {
              enqueueEvent(ctx, "error", { message: "Failed to parse match.jsonl" });
              closeStream(ctx);
              return;
            }
            if (shouldSkipEvent(parsed, lastEventId)) {
              continue;
            }
            const redacted = redactEvent(parsed, modeProfile, BROADCAST_MATCH_PHASE) as MatchEvent | null;
            if (redacted) {
              enqueueEvent(ctx, "match_event", redacted, redacted.seq);
              hadAnyEvents = true;
              sentWaiting = false;
            }
          }
        }
      } catch {
        enqueueEvent(ctx, "error", { message: "Failed to read match.jsonl" });
        closeStream(ctx);
        return;
      }
    }

    if (now - lastStatusCheck >= STATUS_POLL_INTERVAL_MS) {
      const updated = await readMatchStatus(statusPath);
      if (!updated) {
        enqueueEvent(ctx, "error", { message: "Missing match_status.json" });
        closeStream(ctx);
        return;
      }
      status = updated;
      if (status.status !== "running") {
        if (status.status === "complete") {
          enqueueEvent(ctx, "match_end", { status: status.status, endedAt: status.endedAt ?? null });
        } else {
          enqueueEvent(ctx, "error", { status: status.status, error: status.error ?? null });
        }
        closeStream(ctx);
        return;
      }
      if (!hadAnyEvents && !sentWaiting) {
        enqueueEvent(ctx, "waiting", { status: "running" });
        sentWaiting = true;
      }
      lastStatusCheck = now;
    }

    await delay(TAIL_POLL_INTERVAL_MS);
  }

  closeStream(ctx);
}

type RouteContext = { params: Promise<{ matchId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { matchId } = await context.params;
  const encoder = new TextEncoder();
  const includeMoments = parseIncludeParams(request).has("moments");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const ctx: StreamContext = { controller, signal: request.signal, encoder };

      if (!isSafeMatchId(matchId)) {
        enqueueEvent(ctx, "error", { message: "Invalid matchId" });
        closeStream(ctx);
        return;
      }

      const matchDir = getMatchDirectory(matchId);
      if (!existsSync(matchDir)) {
        enqueueEvent(ctx, "error", { message: "Match not found" });
        closeStream(ctx);
        return;
      }

      if (request.signal.aborted) {
        closeStream(ctx);
        return;
      }

      const abortListener = () => {
        closeStream(ctx);
      };
      request.signal.addEventListener("abort", abortListener, { once: true });

      void streamMatchEvents(ctx, matchDir, parseLastEventId(request), includeMoments).catch(() => {
        if (!request.signal.aborted) {
          enqueueEvent(ctx, "error", { message: "Stream error" });
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
