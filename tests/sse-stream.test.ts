import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/api/matches/[matchId]/stream/route.js";

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

async function readEvents(response: Response, maxEvents: number, timeoutMs = 2000): Promise<ParsedEvent[]> {
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

function createSseReader(response: Response) {
  const reader = response.body?.getReader();
  let buffer = "";

  async function nextEvent(timeoutMs = 3000): Promise<ParsedEvent | null> {
    if (!reader) {
      return null;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) {
        return null;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const chunk = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        if (chunk.trim()) {
          return parseSseEvent(chunk);
        }
        boundaryIndex = buffer.indexOf("\n\n");
      }
    }
    return null;
  }

  async function close(): Promise<void> {
    if (reader) {
      await reader.cancel();
    }
  }

  return { nextEvent, close };
}

function createMatchDir(baseDir: string, matchId: string): string {
  const matchDir = join(baseDir, matchId);
  mkdirSync(matchDir, { recursive: true });
  return matchDir;
}

function writeStatus(matchDir: string, status: object): void {
  const payload = JSON.stringify(status) + "\n";
  writeFileSync(join(matchDir, "match_status.json"), payload, "utf-8");
}

function writeLog(matchDir: string, lines: string[]): void {
  writeFileSync(join(matchDir, "match.jsonl"), lines.join("\n") + "\n", "utf-8");
}

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "sse-stream-"));
  process.env.MATCH_STORAGE_DIR = tempDir;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.MATCH_STORAGE_DIR;
});

describe("GET /api/matches/[matchId]/stream", () => {
  it("emits error when match directory is missing", async () => {
    const request = new Request("http://localhost/api/matches/m_miss12345678/stream");
    const response = await GET(request, { params: Promise.resolve({ matchId: "m_miss12345678" }) });
    const events = await readEvents(response, 1);
    expect(events[0]?.event).toBe("error");
    expect(events[0]?.data).toEqual({ message: "Match not found" });
  });

  it("streams catch-up events and respects Last-Event-ID", async () => {
    const matchId = "m_catchup12345";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, { status: "complete", startedAt: new Date().toISOString() });
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
      { type: "MatchEnded", seq: 2, matchId, reason: "completed", scores: { a: 1, b: 0 }, turns: 1 },
    ];
    writeLog(
      matchDir,
      events.map((event) => JSON.stringify(event)),
    );

    const request = new Request("http://localhost/api/matches/m_catchup12345/stream", {
      headers: { "Last-Event-ID": "1" },
    });
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const received = await readEvents(response, 3);
    expect(received[0]?.event).toBe("verification");
    expect(received[1]?.event).toBe("match_event");
    expect(received[1]?.data).toMatchObject({ seq: 2, type: "MatchEnded" });
    expect(received[2]?.event).toBe("match_end");
  });

  it("emits waiting when match is running and no events yet", async () => {
    const matchId = "m_waiting12345";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, { status: "running", startedAt: new Date().toISOString() });
    writeFileSync(join(matchDir, "match.jsonl"), "", "utf-8");

    const request = new Request("http://localhost/api/matches/m_waiting12345/stream");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const received = await readEvents(response, 2);
    expect(received[0]?.event).toBe("verification");
    expect(received[1]?.event).toBe("waiting");
  });

  it("tails new events appended to match.jsonl", async () => {
    const matchId = "m_tail12345678";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, { status: "running", startedAt: new Date().toISOString() });
    writeFileSync(join(matchDir, "match.jsonl"), "", "utf-8");

    const request = new Request("http://localhost/api/matches/m_tail12345678/stream");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const sseReader = createSseReader(response);

    let event = await sseReader.nextEvent();
    if (event?.event === "verification") {
      event = await sseReader.nextEvent();
    }
    expect(event?.event).toBe("waiting");

    const nextEvent = {
      type: "TurnStarted",
      seq: 0,
      matchId,
      turn: 1,
    };
    appendFileSync(join(matchDir, "match.jsonl"), JSON.stringify(nextEvent) + "\n", "utf-8");

    let matchEvent: ParsedEvent | null = null;
    while (matchEvent?.event !== "match_event") {
      matchEvent = await sseReader.nextEvent();
      if (!matchEvent) {
        break;
      }
    }
    expect(matchEvent?.data).toMatchObject({ type: "TurnStarted", seq: 0 });

    writeStatus(matchDir, {
      status: "complete",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    });

    let endEvent: ParsedEvent | null = null;
    while (endEvent?.event !== "match_end") {
      endEvent = await sseReader.nextEvent();
      if (!endEvent) {
        break;
      }
    }
    expect(endEvent?.event).toBe("match_end");
    await sseReader.close();
  });

  it("emits error for failed or incomplete matches", async () => {
    const matchId = "m_failed123456";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, { status: "failed", startedAt: new Date().toISOString(), error: "boom" });

    const request = new Request("http://localhost/api/matches/m_failed123456/stream");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const received = await readEvents(response, 2);
    expect(received[0]?.event).toBe("verification");
    expect(received[1]?.event).toBe("error");
    expect(received[1]?.data).toMatchObject({ status: "failed", error: "boom" });
  });

  it("never emits _private data over SSE", async () => {
    const matchId = "m_private123456";
    const matchDir = createMatchDir(tempDir, matchId);
    writeStatus(matchDir, {
      status: "complete",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
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

    const request = new Request("http://localhost/api/matches/m_private123456/stream");
    const response = await GET(request, { params: Promise.resolve({ matchId }) });
    const received = await readEvents(response, 5);
    const matchEvents = received.filter((event) => event.event === "match_event");
    for (const event of matchEvents) {
      const payload = JSON.stringify(event.data);
      expect(payload).not.toContain('"_private"');
      expect(payload).not.toContain("secretNumber");
    }
  });
});
