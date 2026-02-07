import { describe, expect, it } from "vitest";
import { createFileEventSource } from "../src/lib/replay/eventSource.js";
import { parseJsonl } from "../src/lib/replay/parseJsonl.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_JSONL = [
  '{"type":"MatchStarted","seq":0,"matchId":"m_1","seed":42,"agentIds":["a","b"],"scenarioName":"numberGuess","maxTurns":10}',
  '{"type":"TurnStarted","seq":1,"matchId":"m_1","turn":1}',
  '{"type":"ActionSubmitted","seq":2,"matchId":"m_1","agentId":"a","turn":1,"action":{"guess":50}}',
  '{"type":"MatchEnded","seq":3,"matchId":"m_1","reason":"completed","scores":{"a":0,"b":100},"turns":1}',
].join("\n");

const EMPTY_TEXT = "";
const ALL_INVALID_TEXT = "not json\nalso bad\n";

// ---------------------------------------------------------------------------
// createFileEventSource
// ---------------------------------------------------------------------------

describe("createFileEventSource", () => {
  it("produces the same events as parseJsonl", () => {
    const direct = parseJsonl(VALID_JSONL);
    const source = createFileEventSource(VALID_JSONL);
    const snapshot = source.getSnapshot();

    expect(snapshot.events).toEqual(direct.events);
    expect(snapshot.errors).toEqual(direct.errors);
  });

  it("has kind 'file'", () => {
    const source = createFileEventSource(VALID_JSONL);
    expect(source.kind).toBe("file");
  });

  it("reports status 'complete' for valid input", () => {
    const source = createFileEventSource(VALID_JSONL);
    expect(source.getSnapshot().status).toBe("complete");
  });

  it("reports status 'complete' for empty input (zero events, zero errors)", () => {
    const source = createFileEventSource(EMPTY_TEXT);
    expect(source.getSnapshot().status).toBe("complete");
    expect(source.getSnapshot().events).toEqual([]);
    expect(source.getSnapshot().errors).toEqual([]);
  });

  it("reports status 'error' when all lines fail to parse", () => {
    const source = createFileEventSource(ALL_INVALID_TEXT);
    const snapshot = source.getSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.errors.length).toBeGreaterThan(0);
  });

  it("reports 'complete' when some lines parse and some fail", () => {
    const mixed = VALID_JSONL + "\nnot json\n";
    const source = createFileEventSource(mixed);
    const snapshot = source.getSnapshot();
    expect(snapshot.status).toBe("complete");
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.errors.length).toBeGreaterThan(0);
  });

  it("subscribe returns an unsubscribe function (no-op for file)", () => {
    const source = createFileEventSource(VALID_JSONL);
    const unsub = source.subscribe(() => {});
    expect(typeof unsub).toBe("function");
    // Calling unsub should not throw
    unsub();
  });

  it("close does not throw", () => {
    const source = createFileEventSource(VALID_JSONL);
    expect(() => source.close()).not.toThrow();
  });

  it("getSnapshot returns a stable reference", () => {
    const source = createFileEventSource(VALID_JSONL);
    const snap1 = source.getSnapshot();
    const snap2 = source.getSnapshot();
    expect(snap1).toBe(snap2);
  });
});
