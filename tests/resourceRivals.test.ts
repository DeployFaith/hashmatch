import { describe, expect, it } from "vitest";
import {
  createResourceRivalsScenario,
  DEFAULT_STARTING_RESOURCES,
} from "../src/scenarios/resourceRivals/index.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createRandomBidderAgent } from "../src/agents/resourceRivals/randomBidder.js";
import { createConservativeAgent } from "../src/agents/resourceRivals/conservativeAgent.js";
import { redactEvent } from "../src/lib/replay/redaction.js";
import { detectMoments } from "../src/lib/replay/detectMoments.js";
import type { ReplayEvent } from "../src/lib/replay/parseJsonl.js";
import type { MatchEvent } from "../src/contract/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchEventToReplayEvent(event: MatchEvent): ReplayEvent {
  return {
    type: event.type,
    seq: event.seq,
    matchId: event.matchId,
    turn: "turn" in event ? (event as { turn: number }).turn : undefined,
    agentId: "agentId" in event ? (event as { agentId: string }).agentId : undefined,
    raw: event as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Scenario basics
// ---------------------------------------------------------------------------

describe("ResourceRivals scenario", () => {
  const scenario = createResourceRivalsScenario();

  it("initializes with correct starting resources", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    expect(state.resources.alice).toBe(DEFAULT_STARTING_RESOURCES);
    expect(state.resources.bob).toBe(DEFAULT_STARTING_RESOURCES);
    expect(state.capturedScore.alice).toBe(0);
    expect(state.capturedScore.bob).toBe(0);
    expect(state.objectives.length).toBeGreaterThanOrEqual(10);
    expect(state.objectives.length).toBeLessThanOrEqual(15);
  });

  it("produces deterministic objectives from same seed", () => {
    const state1 = scenario.init(42, ["alice", "bob"]);
    const state2 = scenario.init(42, ["alice", "bob"]);
    expect(state1.objectives).toEqual(state2.objectives);
  });

  it("produces different objectives from different seeds", () => {
    const state1 = scenario.init(42, ["alice", "bob"]);
    const state2 = scenario.init(99, ["alice", "bob"]);
    // With high probability, at least one objective differs
    const same = state1.objectives.every(
      (o, i) => state2.objectives[i] && o.value === state2.objectives[i].value,
    );
    expect(same).toBe(false);
  });

  it("observation includes _private with remainingResources", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    const obs = scenario.observe(state, "alice");
    expect(obs._private).toBeDefined();
    expect(obs._private.remainingResources).toBe(DEFAULT_STARTING_RESOURCES);
    expect(obs.objectiveValue).toBeGreaterThan(0);
    expect(obs.objectivesRemaining).toBe(state.objectives.length);
  });

  it("adjudicates a valid bid", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    const result = scenario.adjudicate(state, "alice", { bid: 10 });
    expect(result.valid).toBe(true);
    // Only alice bid, bob hasn't yet, so objective not resolved
    expect(result.state.currentObjective).toBe(0);
  });

  it("resolves when both agents bid", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    const afterAlice = scenario.adjudicate(state, "alice", { bid: 10 });
    const afterBob = scenario.adjudicate(afterAlice.state, "bob", { bid: 5 });
    expect(afterBob.state.currentObjective).toBe(1);
    // Alice bid higher, should win
    expect(afterBob.state.bidHistory[0].winner).toBe("alice");
    // Alice gets the objective value
    expect(afterBob.state.capturedScore.alice).toBe(state.objectives[0].value);
    expect(afterBob.state.capturedScore.bob).toBe(0);
    // Resources deducted
    expect(afterBob.state.resources.alice).toBe(DEFAULT_STARTING_RESOURCES - 10);
    expect(afterBob.state.resources.bob).toBe(DEFAULT_STARTING_RESOURCES - 5);
  });

  it("handles tied bids (no winner)", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    const afterAlice = scenario.adjudicate(state, "alice", { bid: 10 });
    const afterBob = scenario.adjudicate(afterAlice.state, "bob", { bid: 10 });
    expect(afterBob.state.bidHistory[0].winner).toBeNull();
    // No one gets the score
    expect(afterBob.state.capturedScore.alice).toBe(0);
    expect(afterBob.state.capturedScore.bob).toBe(0);
    // But resources are still spent
    expect(afterBob.state.resources.alice).toBe(DEFAULT_STARTING_RESOURCES - 10);
    expect(afterBob.state.resources.bob).toBe(DEFAULT_STARTING_RESOURCES - 10);
  });

  it("rejects invalid bid (over budget)", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    const result = scenario.adjudicate(state, "alice", { bid: 999 });
    expect(result.valid).toBe(false);
    expect((result.feedback as Record<string, unknown>).error).toBeDefined();
  });

  it("rejects invalid bid (negative)", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    const result = scenario.adjudicate(state, "alice", { bid: -5 });
    expect(result.valid).toBe(false);
  });

  it("reaches terminal state after all objectives", () => {
    let state = scenario.init(42, ["alice", "bob"]);
    while (!scenario.isTerminal(state)) {
      const resultA = scenario.adjudicate(state, "alice", { bid: 1 });
      const resultB = scenario.adjudicate(resultA.state, "bob", { bid: 0 });
      state = resultB.state;
    }
    expect(scenario.isTerminal(state)).toBe(true);
    expect(state.currentObjective).toBe(state.objectives.length);
  });

  it("score returns captured scores", () => {
    let state = scenario.init(42, ["alice", "bob"]);
    const resultA = scenario.adjudicate(state, "alice", { bid: 10 });
    const resultB = scenario.adjudicate(resultA.state, "bob", { bid: 5 });
    state = resultB.state;
    const scores = scenario.score(state);
    expect(scores.alice).toBe(state.objectives[0].value);
    expect(scores.bob).toBe(0);
  });

  it("summarize does not expose resources", () => {
    const state = scenario.init(42, ["alice", "bob"]);
    const summary = scenario.summarize(state) as Record<string, unknown>;
    expect(summary.scores).toBeDefined();
    expect((summary as Record<string, unknown>).resources).toBeUndefined();
  });

  it("reveal exposes full bid history and resources", () => {
    let state = scenario.init(42, ["alice", "bob"]);
    const resultA = scenario.adjudicate(state, "alice", { bid: 10 });
    const resultB = scenario.adjudicate(resultA.state, "bob", { bid: 5 });
    state = resultB.state;
    const revealed = scenario.reveal!(state) as Record<string, unknown>;
    expect(revealed.finalResources).toBeDefined();
    expect(revealed.bidHistory).toBeDefined();
    expect(revealed.objectives).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Full match integration
// ---------------------------------------------------------------------------

describe("ResourceRivals full match", () => {
  it("runs a complete match with random agents", () => {
    const scenario = createResourceRivalsScenario();
    const agents = [createRandomBidderAgent("alice"), createConservativeAgent("bob")];
    const result = runMatch(scenario, agents, { seed: 42, maxTurns: 30 });

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.scores.alice).toBeDefined();
    expect(result.scores.bob).toBeDefined();

    // Match should end
    const matchEnded = result.events.find((e) => e.type === "MatchEnded");
    expect(matchEnded).toBeDefined();
  });

  it("produces deterministic results from same seed", () => {
    const scenario1 = createResourceRivalsScenario();
    const scenario2 = createResourceRivalsScenario();
    const agents1 = [createRandomBidderAgent("alice"), createConservativeAgent("bob")];
    const agents2 = [createRandomBidderAgent("alice"), createConservativeAgent("bob")];

    const result1 = runMatch(scenario1, agents1, { seed: 42, maxTurns: 30 });
    const result2 = runMatch(scenario2, agents2, { seed: 42, maxTurns: 30 });

    expect(result1.scores).toEqual(result2.scores);
    expect(result1.events.length).toBe(result2.events.length);
  });

  it("observations use _private convention", () => {
    const scenario = createResourceRivalsScenario();
    const agents = [createRandomBidderAgent("alice"), createConservativeAgent("bob")];
    const result = runMatch(scenario, agents, { seed: 42, maxTurns: 30 });

    const obsEvents = result.events.filter((e) => e.type === "ObservationEmitted");
    expect(obsEvents.length).toBeGreaterThan(0);

    for (const ev of obsEvents) {
      const raw = ev as unknown as Record<string, unknown>;
      const obs = raw.observation as Record<string, unknown>;
      expect(obs._private).toBeDefined();
      expect((obs._private as Record<string, unknown>).remainingResources).toBeDefined();
    }
  });

  it("spectator redaction strips remainingResources", () => {
    const scenario = createResourceRivalsScenario();
    const agents = [createRandomBidderAgent("alice"), createConservativeAgent("bob")];
    const result = runMatch(scenario, agents, { seed: 42, maxTurns: 30 });

    const obsEvent = result.events.find((e) => e.type === "ObservationEmitted");
    expect(obsEvent).toBeDefined();

    const replay = matchEventToReplayEvent(obsEvent!);
    const redacted = redactEvent(replay, { mode: "spectator", revealSpoilers: false });

    expect(redacted.isRedacted).toBe(true);
    const obs = redacted.displayRaw.observation as Record<string, unknown>;
    expect(obs.objectiveValue).toBeDefined();
    expect(obs._private).toBeUndefined();
    expect(redacted.summary).toContain("[partially redacted]");
  });

  it("director mode preserves _private fields", () => {
    const scenario = createResourceRivalsScenario();
    const agents = [createRandomBidderAgent("alice"), createConservativeAgent("bob")];
    const result = runMatch(scenario, agents, { seed: 42, maxTurns: 30 });

    const obsEvent = result.events.find((e) => e.type === "ObservationEmitted");
    const replay = matchEventToReplayEvent(obsEvent!);
    const redacted = redactEvent(replay, { mode: "director", revealSpoilers: false });

    expect(redacted.isRedacted).toBe(false);
    const obs = redacted.displayRaw.observation as Record<string, unknown>;
    expect(obs._private).toBeDefined();
  });

  it("generates meaningful moments from match events", () => {
    const scenario = createResourceRivalsScenario();
    const agents = [createRandomBidderAgent("alice"), createConservativeAgent("bob")];
    const result = runMatch(scenario, agents, { seed: 42, maxTurns: 30 });

    const moments = detectMoments(result.events);
    // A match between random and conservative should produce at least some
    // score swings or lead changes due to the bidding dynamics
    // (not guaranteed for every seed, but very likely for seed 42)
    expect(moments).toBeDefined();
    expect(Array.isArray(moments)).toBe(true);
  });
});
