import { describe, expect, it } from "vitest";
import { redactEvent, redactEvents } from "../src/lib/replay/redaction.js";
import type { ReplayEvent } from "../src/lib/replay/parseJsonl.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ReplayEvent> & { type: string; seq: number }): ReplayEvent {
  const baseRaw = { type: overrides.type, seq: overrides.seq, matchId: "m_test" };
  const mergedRaw =
    overrides.raw && typeof overrides.raw === "object"
      ? { ...baseRaw, ...overrides.raw }
      : baseRaw;
  return {
    matchId: "m_test",
    ...overrides,
    raw: mergedRaw,
  } as ReplayEvent;
}

const matchStarted: ReplayEvent = makeEvent({
  type: "MatchStarted",
  seq: 0,
  raw: { scenarioName: "numberGuess", agentIds: ["alice", "bob"], seed: 42, maxTurns: 10 },
});

const observation: ReplayEvent = makeEvent({
  type: "ObservationEmitted",
  seq: 2,
  turn: 1,
  agentId: "alice",
  raw: { observation: { range: [1, 100], hint: "Guess a number" } },
});

const matchEnded: ReplayEvent = makeEvent({
  type: "MatchEnded",
  seq: 17,
  raw: {
    reason: "completed",
    scores: { alice: 1, bob: 0 },
    turns: 2,
    details: { winner: "alice", secret: 63 },
  },
});

const agentError: ReplayEvent = makeEvent({
  type: "AgentError",
  seq: 5,
  turn: 2,
  agentId: "bob",
  raw: { message: "timeout" },
});

const unknownEvent: ReplayEvent = makeEvent({
  type: "CustomEvent",
  seq: 99,
  raw: { foo: "bar" },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("redactEvent", () => {
  describe("spectator mode (default)", () => {
    it("does not redact MatchStarted", () => {
      const result = redactEvent(matchStarted);
      expect(result.isRedacted).toBe(false);
      expect(result.displayRaw.scenarioName).toBe("numberGuess");
    });

    it("redacts ObservationEmitted", () => {
      const result = redactEvent(observation);
      expect(result.isRedacted).toBe(true);
      expect(result.displayRaw.observation).toContain("hidden");
      expect(result.summary).toContain("[redacted]");
    });

    it("redacts MatchEnded scores and details", () => {
      const result = redactEvent(matchEnded);
      expect(result.isRedacted).toBe(true);
      expect(result.displayRaw.scores).toContain("hidden");
      expect(result.displayRaw.details).toContain("hidden");
      expect(result.displayRaw.reason).toContain("hidden");
      expect(result.summary).toContain("[spoiler hidden]");
    });

    it("does not redact AgentError", () => {
      const result = redactEvent(agentError);
      expect(result.isRedacted).toBe(false);
    });

    it("does not provide fullRaw when spoilers are off", () => {
      const result = redactEvent(matchEnded);
      expect(result.fullRaw).toBeNull();
    });

    it("handles unknown event types gracefully", () => {
      const result = redactEvent(unknownEvent);
      expect(result.isRedacted).toBe(false);
      expect(result.summary).toContain("unknown");
      expect(result.displayRaw.foo).toBe("bar");
    });
  });

  describe("spectator mode with spoilers revealed", () => {
    const opts = { mode: "spectator" as const, revealSpoilers: true };

    it("shows ObservationEmitted payload", () => {
      const result = redactEvent(observation, opts);
      expect(result.isRedacted).toBe(false);
      expect(result.displayRaw.observation).toBeDefined();
      expect(typeof result.displayRaw.observation).not.toBe("string");
    });

    it("shows MatchEnded scores and details", () => {
      const result = redactEvent(matchEnded, opts);
      expect(result.isRedacted).toBe(false);
      expect(result.displayRaw.scores).toEqual({ alice: 1, bob: 0 });
      expect(result.fullRaw).not.toBeNull();
      expect(result.fullRaw?.details).toEqual({ winner: "alice", secret: 63 });
    });
  });

  describe("postMatch mode", () => {
    const opts = { mode: "postMatch" as const, revealSpoilers: false };

    it("redacts MatchEnded without spoilers", () => {
      const result = redactEvent(matchEnded, opts);
      expect(result.isRedacted).toBe(true);
    });

    it("does not redact ObservationEmitted", () => {
      const result = redactEvent(observation, opts);
      expect(result.isRedacted).toBe(false);
    });
  });

  describe("director mode", () => {
    const opts = { mode: "director" as const, revealSpoilers: false };

    it("never redacts anything", () => {
      const obsResult = redactEvent(observation, opts);
      expect(obsResult.isRedacted).toBe(false);

      const endResult = redactEvent(matchEnded, opts);
      expect(endResult.isRedacted).toBe(false);
      expect(endResult.fullRaw).not.toBeNull();
    });
  });
});

describe("redactEvents", () => {
  it("redacts a batch of events", () => {
    const events = [matchStarted, observation, matchEnded];
    const results = redactEvents(events);
    expect(results).toHaveLength(3);
    expect(results[0].isRedacted).toBe(false);
    expect(results[1].isRedacted).toBe(true);
    expect(results[2].isRedacted).toBe(true);
  });

  it("respects options for entire batch", () => {
    const events = [matchStarted, observation, matchEnded];
    const results = redactEvents(events, { revealSpoilers: true });
    expect(results.every((r) => !r.isRedacted)).toBe(true);
  });
});
