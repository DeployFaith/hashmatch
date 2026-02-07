import { describe, expect, it } from "vitest";
import { redactEvent } from "../src/lib/redaction/redactEvent";
import type { ModeProfile, MatchPhase } from "../src/lib/redaction/redactEvent";
import type {
  MatchEvent,
  ObservationEmittedEvent,
  StateUpdatedEvent,
  MatchStartedEvent,
} from "../src/contract/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const liveSafe: ModeProfile = { visibility: { spectatorPolicy: "live_safe" } };
const postMatchReveal: ModeProfile = { visibility: { spectatorPolicy: "post_match_reveal" } };
const alwaysFull: ModeProfile = { visibility: { spectatorPolicy: "always_full" } };

function makeObservation(observation: unknown): ObservationEmittedEvent {
  return {
    type: "ObservationEmitted",
    seq: 1,
    matchId: "m_test",
    agentId: "alice",
    turn: 1,
    observation,
  } as ObservationEmittedEvent;
}

function makeStateUpdated(summary: unknown): StateUpdatedEvent {
  return {
    type: "StateUpdated",
    seq: 2,
    matchId: "m_test",
    turn: 1,
    summary,
  } as StateUpdatedEvent;
}

function makeMatchStarted(): MatchStartedEvent {
  return {
    type: "MatchStarted",
    seq: 0,
    matchId: "m_test",
    seed: 42,
    agentIds: ["alice", "bob"],
    scenarioName: "numberGuess",
    maxTurns: 10,
  };
}

// ---------------------------------------------------------------------------
// 1. Basic _private stripping
// ---------------------------------------------------------------------------

describe("redactEvent — server-side redaction gate", () => {
  describe("basic _private stripping", () => {
    it("removes top-level _privateFoo field from event payload", () => {
      const event = makeObservation({ publicField: 1, _privateFoo: "secret" });
      const result = redactEvent(event, liveSafe, "live");

      expect(result.type).toBe("ObservationEmitted");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      expect(obs.publicField).toBe(1);
      expect(obs._privateFoo).toBeUndefined();
      expect("_privateFoo" in obs).toBe(false);
    });

    it("does not mutate the original event", () => {
      const event = makeObservation({ publicField: 1, _privateFoo: "secret" });
      const originalJSON = JSON.stringify(event);
      redactEvent(event, liveSafe, "live");
      expect(JSON.stringify(event)).toBe(originalJSON);
    });

    it("strips exact _private key (existing convention)", () => {
      const event = makeObservation({
        objectiveValue: 12,
        _private: { remainingResources: 73 },
      });
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      expect(obs.objectiveValue).toBe(12);
      expect(obs._private).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Nested _private stripping
  // ---------------------------------------------------------------------------

  describe("nested _private stripping", () => {
    it("strips _private from nested objects", () => {
      const event = makeObservation({
        publicField: 1,
        nested: { visible: true, _privateResource: 50 },
      });
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      const nested = obs.nested as Record<string, unknown>;
      expect(nested.visible).toBe(true);
      expect(nested._privateResource).toBeUndefined();
    });

    it("strips _private 2+ levels deep", () => {
      const event = makeObservation({
        level1: { level2: { _privateDeep: true, keepMe: "yes" } },
      });
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      const level2 = (obs.level1 as Record<string, unknown>).level2 as Record<string, unknown>;
      expect(level2._privateDeep).toBeUndefined();
      expect(level2.keepMe).toBe("yes");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Array recursion
  // ---------------------------------------------------------------------------

  describe("array recursion", () => {
    it("strips _private from objects inside arrays", () => {
      const event = makeObservation({
        items: [
          { _privateFoo: 1, bar: 2 },
          { _privateBaz: 3, qux: 4 },
        ],
      });
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      const items = obs.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ bar: 2 });
      expect(items[1]).toEqual({ qux: 4 });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ObservationEmitted fully-private placeholder
  // ---------------------------------------------------------------------------

  describe("ObservationEmitted fully-private placeholder", () => {
    it("replaces fully-private observation with { redacted: true }", () => {
      const event = makeObservation({ _privateA: 1, _privateB: 2 });
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation;
      expect(obs).toEqual({ redacted: true });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ObservationEmitted partially-private
  // ---------------------------------------------------------------------------

  describe("ObservationEmitted partially-private", () => {
    it("keeps public fields without placeholder", () => {
      const event = makeObservation({ publicScore: 10, _privateResources: 50 });
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      expect(obs).toEqual({ publicScore: 10 });
      expect(obs._privateResources).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Non-Observation events with _private fields
  // ---------------------------------------------------------------------------

  describe("non-observation events with _private fields", () => {
    it("strips _private from StateUpdated summary", () => {
      const event = makeStateUpdated({ public: "ok", _privateInternal: "debug" });
      const result = redactEvent(event, liveSafe, "live");
      const summary = (result as StateUpdatedEvent).summary as Record<string, unknown>;
      expect(summary.public).toBe("ok");
      expect(summary._privateInternal).toBeUndefined();
    });

    it("strips _private keys at event top level", () => {
      // Simulate an event with a _private-prefixed key at the top level
      const event = {
        type: "StateUpdated",
        seq: 2,
        matchId: "m_test",
        turn: 1,
        summary: { score: 5 },
        _privateDebug: { internalState: "x" },
      } as unknown as MatchEvent;
      const result = redactEvent(event, liveSafe, "live");
      expect((result as unknown as Record<string, unknown>)._privateDebug).toBeUndefined();
      expect((result as StateUpdatedEvent).summary).toEqual({ score: 5 });
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Events with NO _private fields
  // ---------------------------------------------------------------------------

  describe("events with no _private fields", () => {
    it("passes through structurally equal", () => {
      const event = makeMatchStarted();
      const result = redactEvent(event, liveSafe, "live");
      expect(result).toEqual(event);
    });

    it("returns a distinct object (no reference sharing)", () => {
      const event = makeMatchStarted();
      const result = redactEvent(event, liveSafe, "live");
      expect(result).not.toBe(event);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Missing modeProfile (null/undefined)
  // ---------------------------------------------------------------------------

  describe("missing modeProfile (null/undefined)", () => {
    it("defaults to live_safe when modeProfile is null", () => {
      const event = makeObservation({ visible: true, _privateSecret: 42 });
      const result = redactEvent(event, null, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      expect(obs.visible).toBe(true);
      expect(obs._privateSecret).toBeUndefined();
    });

    it("defaults to live_safe when modeProfile is undefined", () => {
      const event = makeObservation({ visible: true, _privateSecret: 42 });
      const result = redactEvent(event, undefined, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      expect(obs.visible).toBe(true);
      expect(obs._privateSecret).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. All matchPhase values
  // ---------------------------------------------------------------------------

  describe("all matchPhase values", () => {
    const phases: MatchPhase[] = ["live", "post_match", "complete", "incomplete"];

    for (const phase of phases) {
      it(`strips _private under '${phase}' phase`, () => {
        const event = makeObservation({ pub: 1, _privateVal: 2 });
        const result = redactEvent(event, liveSafe, phase);
        const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
        expect(obs.pub).toBe(1);
        expect(obs._privateVal).toBeUndefined();
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 10. Deterministic output shape
  // ---------------------------------------------------------------------------

  describe("deterministic output shape", () => {
    it("produces identical output for identical input", () => {
      const event = makeObservation({
        z: 3,
        a: 1,
        m: 2,
        _privateX: "hidden",
      });
      const result1 = redactEvent(event, liveSafe, "live");
      const result2 = redactEvent(event, liveSafe, "live");
      expect(result1).toEqual(result2);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("empty observation {} stays {} (not replaced with placeholder)", () => {
      const event = makeObservation({});
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation;
      expect(obs).toEqual({});
    });

    it("null observation handled gracefully", () => {
      const event = makeObservation(null);
      const result = redactEvent(event, liveSafe, "live");
      expect((result as ObservationEmittedEvent).observation).toBeNull();
    });

    it("primitive observation handled gracefully", () => {
      const event = makeObservation(42);
      const result = redactEvent(event, liveSafe, "live");
      expect((result as ObservationEmittedEvent).observation).toBe(42);
    });

    it("string observation handled gracefully", () => {
      const event = makeObservation("hello");
      const result = redactEvent(event, liveSafe, "live");
      expect((result as ObservationEmittedEvent).observation).toBe("hello");
    });

    it("array observation handled gracefully (no placeholder)", () => {
      const event = makeObservation([{ _privateFoo: 1, bar: 2 }]);
      const result = redactEvent(event, liveSafe, "live");
      const obs = (result as ObservationEmittedEvent).observation as unknown[];
      expect(obs).toEqual([{ bar: 2 }]);
    });

    it("unknown event types still get _private stripping", () => {
      const event = {
        type: "CustomFutureEvent",
        seq: 99,
        matchId: "m_test",
        _privateData: "secret",
        publicData: "visible",
      } as unknown as MatchEvent;
      const result = redactEvent(event, liveSafe, "live");
      const raw = result as unknown as Record<string, unknown>;
      expect(raw.publicData).toBe("visible");
      expect(raw._privateData).toBeUndefined();
    });

    it("handles undefined fields in event gracefully", () => {
      const event = {
        type: "StateUpdated",
        seq: 1,
        matchId: "m_test",
        turn: 1,
        summary: null,
      } as unknown as MatchEvent;
      expect(() => redactEvent(event, liveSafe, "live")).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // always_full policy
  // ---------------------------------------------------------------------------

  describe("always_full policy", () => {
    it("does not strip _private fields", () => {
      const event = makeObservation({
        publicScore: 10,
        _privateResources: 50,
      });
      const result = redactEvent(event, alwaysFull, "live");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      expect(obs.publicScore).toBe(10);
      expect(obs._privateResources).toBe(50);
    });

    it("returns a copy (does not share reference)", () => {
      const event = makeObservation({ value: 1 });
      const result = redactEvent(event, alwaysFull, "live");
      expect(result).toEqual(event);
      expect(result).not.toBe(event);
    });
  });

  // ---------------------------------------------------------------------------
  // post_match_reveal policy (MVP: same as live_safe)
  // ---------------------------------------------------------------------------

  describe("post_match_reveal policy (MVP)", () => {
    it("strips _private (conservative MVP behavior)", () => {
      const event = makeObservation({ pub: 1, _privateVal: 2 });
      const result = redactEvent(event, postMatchReveal, "post_match");
      const obs = (result as ObservationEmittedEvent).observation as Record<string, unknown>;
      expect(obs.pub).toBe(1);
      expect(obs._privateVal).toBeUndefined();
    });
  });
});
