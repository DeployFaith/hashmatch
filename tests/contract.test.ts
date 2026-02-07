import { describe, expect, it } from "vitest";
import { runMatch } from "../src/engine/runMatch.js";
import { createNumberGuessScenario } from "../src/scenarios/numberGuess/index.js";
import { createRandomAgent } from "../src/agents/randomAgent.js";
import { createBaselineAgent } from "../src/agents/baselineAgent.js";
import type { JsonValue, MatchEvent } from "../src/contract/types.js";

function makeAgents() {
  return [createRandomAgent("random-1"), createBaselineAgent("baseline-1")];
}

function makeScenario() {
  return createNumberGuessScenario();
}

describe("Contract v0 — Match Runner", () => {
  describe("determinism", () => {
    it("same seed + same agents => identical event log", () => {
      const result1 = runMatch(makeScenario(), makeAgents(), { seed: 123, maxTurns: 20 });
      const result2 = runMatch(makeScenario(), makeAgents(), { seed: 123, maxTurns: 20 });

      expect(result1.events).toEqual(result2.events);
      expect(result1.scores).toEqual(result2.scores);
      expect(result1.matchId).toBe(result2.matchId);
    });

    it("deterministic across multiple runs with different seeds", () => {
      for (const seed of [0, 1, 42, 999, 2147483647]) {
        const a = runMatch(makeScenario(), makeAgents(), { seed, maxTurns: 15 });
        const b = runMatch(makeScenario(), makeAgents(), { seed, maxTurns: 15 });
        expect(a.events).toEqual(b.events);
      }
    });
  });

  describe("variation", () => {
    it("different seed => different events", () => {
      const r1 = runMatch(makeScenario(), makeAgents(), { seed: 1, maxTurns: 20 });
      const r2 = runMatch(makeScenario(), makeAgents(), { seed: 999, maxTurns: 20 });

      const json1 = JSON.stringify(r1.events);
      const json2 = JSON.stringify(r2.events);
      expect(json1).not.toBe(json2);
    });
  });

  describe("runner safety", () => {
    it("respects maxTurns", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 3 });
      expect(result.turns).toBeLessThanOrEqual(3);
    });

    it("always produces MatchStarted as first event", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 20 });
      expect(result.events[0].type).toBe("MatchStarted");
    });

    it("always produces MatchEnded as last event", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 20 });
      const last = result.events[result.events.length - 1];
      expect(last.type).toBe("MatchEnded");
    });

    it("MatchEnded reason is 'completed' when scenario terminates early", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 100 });
      const ended = result.events[result.events.length - 1];
      if (ended.type === "MatchEnded") {
        expect(ended.reason).toBe("completed");
      }
    });

    it("events have monotonically increasing seq numbers", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 77, maxTurns: 10 });
      for (let i = 0; i < result.events.length; i++) {
        expect(result.events[i].seq).toBe(i);
      }
    });

    it("all events share the same matchId", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 55, maxTurns: 10 });
      const { matchId } = result;
      for (const event of result.events) {
        expect(event.matchId).toBe(matchId);
      }
    });
  });

  describe("provenance", () => {
    it("omits provenance fields when not provided", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 10 });
      const started = result.events[0];
      if (started.type === "MatchStarted") {
        expect("engineCommit" in started).toBe(false);
        expect("engineVersion" in started).toBe(false);
      }
    });

    it("includes provenance fields when provided", () => {
      const result = runMatch(makeScenario(), makeAgents(), {
        seed: 42,
        maxTurns: 10,
        provenance: { engineCommit: "abc123", engineVersion: "1.2.3" },
      });
      const started = result.events[0];
      if (started.type === "MatchStarted") {
        expect(started.engineCommit).toBe("abc123");
        expect(started.engineVersion).toBe("1.2.3");
      }
    });
  });

  describe("secrets policy", () => {
    it("StateUpdated summaries do not contain secretNumber", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 20 });
      const stateEvents = result.events.filter((e) => e.type === "StateUpdated");
      expect(stateEvents.length).toBeGreaterThan(0);
      for (const e of stateEvents) {
        if (e.type === "StateUpdated") {
          const summary = e.summary as Record<string, JsonValue>;
          expect(summary).not.toHaveProperty("secretNumber");
        }
      }
    });

    it("MatchEnded is emitted exactly once and includes details._private.secretNumber", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 20 });
      const endedEvents = result.events.filter((e) => e.type === "MatchEnded");
      expect(endedEvents.length).toBe(1);
      const ended = endedEvents[0];
      if (ended.type === "MatchEnded") {
        expect(ended.details).toBeDefined();
        const details = ended.details as Record<string, JsonValue>;
        expect(details).toHaveProperty("_private");
        const privateDetails = details["_private"] as Record<string, JsonValue>;
        expect(privateDetails).toHaveProperty("secretNumber");
        expect(typeof privateDetails["secretNumber"]).toBe("number");
      }
    });
  });

  describe("serialization", () => {
    it("every event is JSON-serializable and round-trips cleanly", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 20 });
      for (const event of result.events) {
        const json = JSON.stringify(event);
        expect(typeof json).toBe("string");
        const parsed = JSON.parse(json) as MatchEvent;
        expect(parsed).toEqual(event);
      }
    });

    it("no event contains undefined or function values", () => {
      const result = runMatch(makeScenario(), makeAgents(), { seed: 42, maxTurns: 20 });
      for (const event of result.events) {
        const json = JSON.stringify(event);
        const parsed = JSON.parse(json) as Record<string, unknown>;
        expect(Object.keys(parsed).length).toBe(Object.keys(event).length);
      }
    });
  });
});
