import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/api/matches/[matchId]/events/route.js";
import type { MatchLifecycleStatusRecord } from "../src/server/matchLifecycle.js";

const decoder = new TextDecoder();

interface ParsedEvent {
  event: string;
  data: unknown;
  id?: string;
}

function parseSseEvent(raw: string): ParsedEvent {
  const lines = raw.split("\n");
  let event = "";
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("id:")) {
      id = line.slice("id:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  const dataText = dataLines.join("\n");
  return { event, data: dataText ? JSON.parse(dataText) : null, ...(id ? { id } : {}) };
}

async function readEvents(
  response: Response,
  maxEvents: number,
  timeoutMs = 2000,
): Promise<ParsedEvent[]> {
  const events: ParsedEvent[] = [];
  const reader = response.body?.getReader();
  if (!reader) {
    return events;
  }
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (events.length < maxEvents && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const chunk = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      if (chunk.trim()) {
        events.push(parseSseEvent(chunk));
      }
      if (events.length >= maxEvents) {
        break;
      }
      boundaryIndex = buffer.indexOf("\n\n");
    }
  }

  await reader.cancel();
  return events;
}

async function readMatchEventsWithTimestamps(
  response: Response,
  maxEvents: number,
  timeoutMs = 2000,
): Promise<Array<{ event: ParsedEvent; timestamp: number }>> {
  const reader = response.body?.getReader();
  const events: Array<{ event: ParsedEvent; timestamp: number }> = [];
  if (!reader) {
    return events;
  }
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (events.length < maxEvents && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const chunk = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      if (chunk.trim()) {
        const parsed = parseSseEvent(chunk);
        if (parsed.event === "match_event") {
          events.push({ event: parsed, timestamp: Date.now() });
          if (events.length >= maxEvents) {
            break;
          }
        }
      }
      boundaryIndex = buffer.indexOf("\n\n");
    }
  }

  await reader.cancel();
  return events;
}

function createMatchDir(baseDir: string, matchId: string): string {
  const matchDir = join(baseDir, "matches", matchId);
  mkdirSync(matchDir, { recursive: true });
  return matchDir;
}

function writeStatus(matchDir: string, status: MatchLifecycleStatusRecord): void {
  const payload = JSON.stringify(status) + "\n";
  writeFileSync(join(matchDir, "match_status.json"), payload, "utf-8");
}

function writeLog(matchDir: string, lines: string[]): void {
  writeFileSync(join(matchDir, "match.jsonl"), lines.join("\n") + "\n", "utf-8");
}

function writeSummary(matchDir: string, scores: Record<string, number>): void {
  writeFileSync(
    join(matchDir, "match_summary.json"),
    JSON.stringify({ matchId: "summary", scores }),
    "utf-8",
  );
}

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "sse-stream-"));
  process.env.HASHMATCH_DATA_DIR = tempDir;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.HASHMATCH_DATA_DIR;
  delete process.env.HASHMATCH_SSE_CADENCE_MS;
  delete process.env.HASHMATCH_TAIL_POLL_MS;
});

describe("GET /api/matches/[matchId]/events", () => {
  it("returns 404 when match directory is missing", async () => {
    const request = new Request("http://localhost/api/matches/m_miss12345678/events");
    const response = await GET(request, { params: Promise.resolve({ matchId: "m_miss12345678" }) });
    expect(response.status).toBe(404);
  });

  it("emits match_status immediately and replays after Last-Event-ID", async () => {
    const matchId = "m_catchup12345";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, {
      matchId,
      status: "finished",
      scenario: "numberGuess",
      agents: ["a", "b"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: "2024-01-01T00:01:00.000Z",
      verified: true,
      totalTurns: 1,
      currentTurn: 1,
    });
    writeSummary(matchDir, { a: 1, b: 0 });
    const events = [
      {
        type: "MatchStarted",
        seq: 0,
        matchId,
        seed: 1,
        agentIds: ["a", "b"],
        scenarioName: "numberGuess",
        maxTurns: 1,
      },
      { type: "TurnStarted", seq: 1, matchId, turn: 1 },
      {
        type: "MatchEnded",
        seq: 2,
        matchId,
        reason: "completed",
        scores: { a: 1, b: 0 },
        turns: 1,
      },
    ];
    writeLog(
      matchDir,
      events.map((event) => JSON.stringify(event)),
    );

    const request = new Request("http://localhost/api/matches/m_catchup12345/events", {
      headers: { "Last-Event-ID": "1" },
    });
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const received = await readEvents(response, 3);
    expect(received[0]?.event).toBe("match_status");
    expect(received[0]?.id).toBe("status");
    expect(received[1]?.event).toBe("match_event");
    expect(received[1]?.data).toMatchObject({ seq: 2, type: "MatchEnded" });
    expect(received[2]?.event).toBe("match_complete");
    expect(received[2]?.id).toBe("done");
    expect(received[2]?.data).toMatchObject({
      status: "finished",
      verified: true,
      finalScores: { a: 1, b: 0 },
    });
  });

  it("emits match_status after every 5 match_events", async () => {
    process.env.HASHMATCH_SSE_CADENCE_MS = "1";
    process.env.HASHMATCH_TAIL_POLL_MS = "1";

    const matchId = "m_batch1234567";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, {
      matchId,
      status: "running",
      scenario: "numberGuess",
      agents: ["a", "b"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: null,
      verified: null,
      totalTurns: 10,
      currentTurn: 1,
    });

    const events = Array.from({ length: 5 }, (_, index) => ({
      type: "TurnStarted",
      seq: index,
      matchId,
      turn: index + 1,
    }));
    writeLog(
      matchDir,
      events.map((event) => JSON.stringify(event)),
    );

    const request = new Request("http://localhost/api/matches/m_batch12345/events");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const received = await readEvents(response, 7);

    const matchStatusEvents = received.filter((event) => event.event === "match_status");
    expect(matchStatusEvents).toHaveLength(2);

    const firstStatusIndex = received.findIndex((event) => event.event === "match_status");
    const secondStatusIndex = received.findIndex(
      (event, index) => event.event === "match_status" && index > firstStatusIndex,
    );
    const matchEventsBetween = received
      .slice(firstStatusIndex + 1, secondStatusIndex)
      .filter((event) => event.event === "match_event");
    expect(matchEventsBetween).toHaveLength(5);
  });

  it("throttles match_event emission by cadence", async () => {
    process.env.HASHMATCH_SSE_CADENCE_MS = "50";
    process.env.HASHMATCH_TAIL_POLL_MS = "1";

    const matchId = "m_throttle1234";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, {
      matchId,
      status: "running",
      scenario: "numberGuess",
      agents: ["a", "b"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: null,
      verified: null,
      totalTurns: 3,
      currentTurn: 1,
    });

    const events = Array.from({ length: 3 }, (_, index) => ({
      type: "TurnStarted",
      seq: index,
      matchId,
      turn: index + 1,
    }));
    writeLog(
      matchDir,
      events.map((event) => JSON.stringify(event)),
    );

    const request = new Request("http://localhost/api/matches/m_throttle12345/events");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const emitted = await readMatchEventsWithTimestamps(response, 3, 4000);

    expect(emitted).toHaveLength(3);
    const firstGap = emitted[1].timestamp - emitted[0].timestamp;
    const secondGap = emitted[2].timestamp - emitted[1].timestamp;
    expect(firstGap).toBeGreaterThanOrEqual(45);
    expect(secondGap).toBeGreaterThanOrEqual(45);
  });

  it("never emits _private data over SSE", async () => {
    const matchId = "m_private12345";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, {
      matchId,
      status: "finished",
      scenario: "numberGuess",
      agents: ["a", "b"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: "2024-01-01T00:01:00.000Z",
      verified: true,
      totalTurns: 1,
      currentTurn: 1,
    });

    const events = [
      {
        type: "MatchStarted",
        seq: 0,
        matchId,
        seed: 1,
        agentIds: ["a", "b"],
        scenarioName: "numberGuess",
        maxTurns: 1,
      },
      {
        type: "ObservationEmitted",
        seq: 1,
        matchId,
        turn: 1,
        agentId: "a",
        observation: { _private: { secretNumber: 42 } },
      },
      {
        type: "MatchEnded",
        seq: 2,
        matchId,
        reason: "completed",
        scores: { a: 1, b: 0 },
        turns: 1,
        details: { _private: { secretNumber: 42 } },
      },
    ];
    writeLog(
      matchDir,
      events.map((event) => JSON.stringify(event)),
    );

    const request = new Request("http://localhost/api/matches/m_private123456/events");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const received = await readEvents(response, 5);
    const matchEvents = received.filter((event) => event.event === "match_event");
    for (const event of matchEvents) {
      const payload = JSON.stringify(event.data);
      expect(payload).not.toContain('"_private"');
      expect(payload).not.toContain("secretNumber");
    }
  });

  it("supports tailing new lines as they are appended", async () => {
    process.env.HASHMATCH_SSE_CADENCE_MS = "1";
    process.env.HASHMATCH_TAIL_POLL_MS = "10";

    const matchId = "m_tail12345678";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, {
      matchId,
      status: "running",
      scenario: "numberGuess",
      agents: ["a", "b"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: null,
      verified: null,
      totalTurns: 2,
      currentTurn: null,
    });
    writeFileSync(join(matchDir, "match.jsonl"), "", "utf-8");

    const request = new Request("http://localhost/api/matches/m_tail123456/events");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });

    expect(response.body).not.toBeNull();

    appendFileSync(
      join(matchDir, "match.jsonl"),
      JSON.stringify({ type: "TurnStarted", seq: 0, matchId, turn: 1 }) + "\n",
      "utf-8",
    );

    const events = await readEvents(response, 2);
    const matchEvent = events.find((event) => event.event === "match_event");
    expect(matchEvent?.data).toMatchObject({ seq: 0, type: "TurnStarted" });
  });
});
