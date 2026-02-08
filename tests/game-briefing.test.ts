import { describe, expect, it } from "vitest";
import type { Agent, AgentConfig, AgentContext, GameBriefing } from "../src/contract/interfaces.js";
import type { AgentId, JsonValue, ObservationEmittedEvent } from "../src/contract/types.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createRandomAgent } from "../src/agents/randomAgent.js";
import { createBaselineAgent } from "../src/agents/baselineAgent.js";
import { createNumberGuessScenario } from "../src/scenarios/numberGuess/index.js";
import {
  createHeistScenario,
  type HeistAction,
  type HeistObservation,
} from "../src/scenarios/heist/index.js";
import {
  createResourceRivalsScenario,
  type ResourceRivalsAction,
  type ResourceRivalsObservation,
} from "../src/scenarios/resourceRivals/index.js";
import { getHeistBriefing } from "../src/scenarios/heist/briefing.js";
import { getResourceRivalsBriefing } from "../src/scenarios/resourceRivals/briefing.js";
import { getNumberGuessBriefing } from "../src/scenarios/numberGuess/briefing.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getObservationEvents(events: { type: string }[]): ObservationEmittedEvent[] {
  return events.filter((e) => e.type === "ObservationEmitted") as ObservationEmittedEvent[];
}

function extractGameRules(obs: JsonValue): GameBriefing | undefined {
  if (typeof obs === "object" && obs !== null && !Array.isArray(obs) && "gameRules" in obs) {
    return obs.gameRules as unknown as GameBriefing;
  }
  return undefined;
}

function createHeistWaitAgent(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(_observation: HeistObservation, _ctx: AgentContext): HeistAction {
      return { type: "wait" };
    },
  };
}

function createResourceRivalsBidAgent(
  id: AgentId,
): Agent<ResourceRivalsObservation, ResourceRivalsAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(_observation: ResourceRivalsObservation, _ctx: AgentContext): ResourceRivalsAction {
      return { bid: 0 };
    },
  };
}

/** Keys that must never appear inside a briefing (heuristic leak check). */
const FORBIDDEN_KEYS = [
  "rooms",
  "doors",
  "itemLocations",
  "seed",
  "secretNumber",
  "map",
  "entities",
  "items",
  "patrolRoute",
  "alertLevel",
  "extractionRoomId",
  "remainingResources",
  "objectives",
  "bidHistory",
  "agentFeedback",
];

function assertNoForbiddenKeys(obj: unknown, label: string): void {
  const json = JSON.stringify(obj);
  for (const key of FORBIDDEN_KEYS) {
    // Check as a JSON key (quoted) to avoid false positives inside
    // descriptions that mention these words in prose.
    expect(json, `${label}: briefing must not contain key "${key}"`).not.toMatch(
      new RegExp(`"${key}"\\s*:`),
    );
  }
}

// ---------------------------------------------------------------------------
// NumberGuess
// ---------------------------------------------------------------------------

describe("GameBriefing — NumberGuess", () => {
  const scenario = createNumberGuessScenario();
  const agents = [createRandomAgent("r1"), createBaselineAgent("b1")];

  it("turn-1 observations include gameRules with correct gameId", async () => {
    const result = await runMatch(scenario, agents, { seed: 42, maxTurns: 10 });
    const observations = getObservationEvents(result.events);
    const turn1Obs = observations.filter((o) => o.turn === 1);
    expect(turn1Obs.length).toBeGreaterThan(0);

    for (const obs of turn1Obs) {
      const rules = extractGameRules(obs.observation);
      expect(rules).toBeDefined();
      expect(rules!.gameId).toBe("numberGuess");
      expect(rules!.name).toBe("NumberGuess");
      expect(rules!.version).toBe("1.0.0");
      expect(rules!.actions.length).toBeGreaterThan(0);
      expect(rules!.observationGuide.length).toBeGreaterThan(0);
    }
  });

  it("turn-2+ observations do NOT include gameRules", async () => {
    const result = await runMatch(scenario, agents, { seed: 42, maxTurns: 10 });
    const observations = getObservationEvents(result.events);
    const laterObs = observations.filter((o) => o.turn > 1);

    for (const obs of laterObs) {
      const rules = extractGameRules(obs.observation);
      expect(rules).toBeUndefined();
    }
  });

  it("briefing does not leak private scenario data", () => {
    const briefing = getNumberGuessBriefing();
    assertNoForbiddenKeys(briefing, "NumberGuess");
  });

  it("briefing is deterministic", () => {
    expect(getNumberGuessBriefing()).toEqual(getNumberGuessBriefing());
  });
});

// ---------------------------------------------------------------------------
// Heist
// ---------------------------------------------------------------------------

describe("GameBriefing — Heist", () => {
  const scenario = createHeistScenario();

  it("turn-1 observation includes gameRules with correct gameId", async () => {
    const agent = createHeistWaitAgent("agent-1");
    const result = await runMatch(scenario, [agent], { seed: 42, maxTurns: 5 });
    const observations = getObservationEvents(result.events);
    const turn1Obs = observations.filter((o) => o.turn === 1);
    expect(turn1Obs.length).toBeGreaterThan(0);

    for (const obs of turn1Obs) {
      const rules = extractGameRules(obs.observation);
      expect(rules).toBeDefined();
      expect(rules!.gameId).toBe("heist");
      expect(rules!.name).toBe("Heist");
      expect(rules!.version).toBe("1.0.0");
      expect(rules!.actions.length).toBe(5);
    }
  });

  it("turn-2+ observations do NOT include gameRules", async () => {
    const agent = createHeistWaitAgent("agent-1");
    const result = await runMatch(scenario, [agent], { seed: 42, maxTurns: 5 });
    const observations = getObservationEvents(result.events);
    const laterObs = observations.filter((o) => o.turn > 1);

    for (const obs of laterObs) {
      const rules = extractGameRules(obs.observation);
      expect(rules).toBeUndefined();
    }
  });

  it("briefing does not leak private scenario data", () => {
    const briefing = getHeistBriefing();
    assertNoForbiddenKeys(briefing, "Heist");
  });

  it("briefing is deterministic", () => {
    expect(getHeistBriefing()).toEqual(getHeistBriefing());
  });
});

// ---------------------------------------------------------------------------
// ResourceRivals
// ---------------------------------------------------------------------------

describe("GameBriefing — ResourceRivals", () => {
  const scenario = createResourceRivalsScenario();
  const agents = [createResourceRivalsBidAgent("r1"), createResourceRivalsBidAgent("b1")];

  it("turn-1 observations include gameRules with correct gameId", async () => {
    const result = await runMatch(scenario, agents, { seed: 42, maxTurns: 20 });
    const observations = getObservationEvents(result.events);
    const turn1Obs = observations.filter((o) => o.turn === 1);
    expect(turn1Obs.length).toBeGreaterThan(0);

    for (const obs of turn1Obs) {
      const rules = extractGameRules(obs.observation);
      expect(rules).toBeDefined();
      expect(rules!.gameId).toBe("resourceRivals");
      expect(rules!.name).toBe("ResourceRivals");
      expect(rules!.version).toBe("1.0.0");
    }
  });

  it("turn-2+ observations do NOT include gameRules", async () => {
    const result = await runMatch(scenario, agents, { seed: 42, maxTurns: 20 });
    const observations = getObservationEvents(result.events);
    const laterObs = observations.filter((o) => o.turn > 1);

    for (const obs of laterObs) {
      const rules = extractGameRules(obs.observation);
      expect(rules).toBeUndefined();
    }
  });

  it("briefing does not leak private scenario data", () => {
    const briefing = getResourceRivalsBriefing();
    assertNoForbiddenKeys(briefing, "ResourceRivals");
  });

  it("briefing is deterministic", () => {
    expect(getResourceRivalsBriefing()).toEqual(getResourceRivalsBriefing());
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting
// ---------------------------------------------------------------------------

describe("GameBriefing — cross-cutting", () => {
  it("getBriefing is available on all three scenarios", () => {
    const heist = createHeistScenario();
    const numberGuess = createNumberGuessScenario();
    const resourceRivals = createResourceRivalsScenario();

    expect(typeof heist.getBriefing).toBe("function");
    expect(typeof numberGuess.getBriefing).toBe("function");
    expect(typeof resourceRivals.getBriefing).toBe("function");
  });

  it("all briefings are JSON-serializable", () => {
    for (const fn of [getHeistBriefing, getResourceRivalsBriefing, getNumberGuessBriefing]) {
      const briefing = fn();
      const json = JSON.stringify(briefing);
      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(briefing);
    }
  });

  it("gameRules does not alter original observation fields", async () => {
    const scenario = createNumberGuessScenario();
    const agents = [createRandomAgent("r1"), createBaselineAgent("b1")];
    const result = await runMatch(scenario, agents, { seed: 42, maxTurns: 10 });
    const observations = getObservationEvents(result.events);
    const turn1 = observations.find((o) => o.turn === 1)!;
    const obs = turn1.observation as Record<string, unknown>;

    // Original NumberGuess observation fields should still be present
    expect(obs).toHaveProperty("rangeMin");
    expect(obs).toHaveProperty("rangeMax");
    expect(obs).toHaveProperty("feedback");
    expect(obs).toHaveProperty("step");
    expect(obs).toHaveProperty("gameRules");
  });
});
