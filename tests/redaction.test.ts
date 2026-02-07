import { describe, expect, it } from "vitest";
import { redactEvent, redactEvents, stripPrivateFields } from "../src/lib/replay/redaction.js";
import type { ReplayEvent } from "../src/lib/replay/parseJsonl.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ReplayEvent> & { type: string; seq: number }): ReplayEvent {
  const baseRaw = { type: overrides.type, seq: overrides.seq, matchId: "m_test" };
  const mergedRaw =
    overrides.raw && typeof overrides.raw === "object" ? { ...baseRaw, ...overrides.raw } : baseRaw;
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

// _private convention fixtures
const observationWithPrivate: ReplayEvent = makeEvent({
  type: "ObservationEmitted",
  seq: 3,
  turn: 1,
  agentId: "alice",
  raw: {
    observation: {
      objectiveValue: 12,
      capturedScore: 45,
      objectivesRemaining: 7,
      _private: { remainingResources: 73 },
    },
  },
});

const observationWithNestedPrivate: ReplayEvent = makeEvent({
  type: "ObservationEmitted",
  seq: 4,
  turn: 2,
  agentId: "bob",
  raw: {
    observation: {
      publicField: "visible",
      nested: {
        alsoPublic: true,
        _private: { secretNested: 42 },
      },
    },
  },
});

const observationWithArrayOfObjects: ReplayEvent = makeEvent({
  type: "ObservationEmitted",
  seq: 5,
  turn: 2,
  agentId: "alice",
  raw: {
    observation: {
      objectives: [
        { value: 10, _private: { bidLimit: 50 } },
        { value: 20, _private: { bidLimit: 30 } },
      ],
    },
  },
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

describe("stripPrivateFields", () => {
  it("strips _private at top level", () => {
    const input = { a: 1, _private: { secret: 2 }, b: 3 };
    const { result, stripped } = stripPrivateFields(input);
    expect(stripped).toBe(true);
    expect(result).toEqual({ a: 1, b: 3 });
  });

  it("strips _private in nested objects", () => {
    const input = { outer: { inner: "ok", _private: { hidden: true } } };
    const { result, stripped } = stripPrivateFields(input);
    expect(stripped).toBe(true);
    expect(result).toEqual({ outer: { inner: "ok" } });
  });

  it("strips _private in arrays of objects", () => {
    const input = [
      { val: 1, _private: { x: 10 } },
      { val: 2, _private: { x: 20 } },
    ];
    const { result, stripped } = stripPrivateFields(input);
    expect(stripped).toBe(true);
    expect(result).toEqual([{ val: 1 }, { val: 2 }]);
  });

  it("returns stripped=false when no _private present", () => {
    const input = { a: 1, b: { c: 2 } };
    const { result, stripped } = stripPrivateFields(input);
    expect(stripped).toBe(false);
    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  it("handles primitives unchanged", () => {
    expect(stripPrivateFields(42)).toEqual({ result: 42, stripped: false });
    expect(stripPrivateFields("hello")).toEqual({ result: "hello", stripped: false });
    expect(stripPrivateFields(null)).toEqual({ result: null, stripped: false });
  });

  it("handles deeply nested _private fields", () => {
    const input = { a: { b: { c: { _private: { deep: true } }, d: 1 } } };
    const { result, stripped } = stripPrivateFields(input);
    expect(stripped).toBe(true);
    expect(result).toEqual({ a: { b: { c: {}, d: 1 } } });
  });
});

describe("_private field-level redaction", () => {
  describe("spectator mode (default)", () => {
    it("strips _private from observation but keeps public fields", () => {
      const result = redactEvent(observationWithPrivate);
      expect(result.isRedacted).toBe(true);
      const obs = result.displayRaw.observation as Record<string, unknown>;
      expect(obs.objectiveValue).toBe(12);
      expect(obs.capturedScore).toBe(45);
      expect(obs.objectivesRemaining).toBe(7);
      expect(obs._private).toBeUndefined();
      expect((obs as Record<string, unknown>).remainingResources).toBeUndefined();
    });

    it("summary says partially redacted for _private observations", () => {
      const result = redactEvent(observationWithPrivate);
      expect(result.summary).toContain("[partially redacted]");
    });

    it("strips nested _private fields", () => {
      const result = redactEvent(observationWithNestedPrivate);
      expect(result.isRedacted).toBe(true);
      const obs = result.displayRaw.observation as Record<string, unknown>;
      expect(obs.publicField).toBe("visible");
      const nested = obs.nested as Record<string, unknown>;
      expect(nested.alsoPublic).toBe(true);
      expect(nested._private).toBeUndefined();
    });

    it("strips _private from arrays of objects in observation", () => {
      const result = redactEvent(observationWithArrayOfObjects);
      expect(result.isRedacted).toBe(true);
      const obs = result.displayRaw.observation as Record<string, unknown>;
      const objectives = obs.objectives as Array<Record<string, unknown>>;
      expect(objectives).toHaveLength(2);
      expect(objectives[0].value).toBe(10);
      expect(objectives[0]._private).toBeUndefined();
      expect(objectives[1].value).toBe(20);
      expect(objectives[1]._private).toBeUndefined();
    });

    it("still fully redacts observations without _private (backward compat)", () => {
      const result = redactEvent(observation);
      expect(result.isRedacted).toBe(true);
      expect(result.displayRaw.observation).toContain("hidden");
      expect(result.summary).toContain("[redacted]");
    });
  });

  describe("spectator mode with spoilers revealed", () => {
    const opts = { mode: "spectator" as const, revealSpoilers: true };

    it("shows full observation including _private fields", () => {
      const result = redactEvent(observationWithPrivate, opts);
      expect(result.isRedacted).toBe(false);
      const obs = result.displayRaw.observation as Record<string, unknown>;
      expect(obs._private).toEqual({ remainingResources: 73 });
    });
  });

  describe("director mode", () => {
    const opts = { mode: "director" as const, revealSpoilers: false };

    it("does not strip _private fields", () => {
      const result = redactEvent(observationWithPrivate, opts);
      expect(result.isRedacted).toBe(false);
      const obs = result.displayRaw.observation as Record<string, unknown>;
      expect(obs._private).toEqual({ remainingResources: 73 });
    });
  });

  describe("postMatch mode", () => {
    const opts = { mode: "postMatch" as const, revealSpoilers: false };

    it("does not strip _private (observations visible in postMatch)", () => {
      const result = redactEvent(observationWithPrivate, opts);
      expect(result.isRedacted).toBe(false);
      const obs = result.displayRaw.observation as Record<string, unknown>;
      expect(obs._private).toEqual({ remainingResources: 73 });
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
