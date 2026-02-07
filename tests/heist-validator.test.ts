import { describe, expect, it } from "vitest";
import type { HeistScenarioParams } from "../src/games/heist/types.js";
import { validateHeistScenario } from "../src/games/heist/validator.js";

const baseScenario = (): HeistScenarioParams => ({
  map: {
    rooms: [
      { id: "spawn", type: "spawn" },
      { id: "hall-a", type: "hallway" },
      { id: "hall-b", type: "hallway" },
      { id: "vault", type: "vault" },
      { id: "extraction", type: "extraction" },
    ],
    doors: [
      { id: "door-1", roomA: "spawn", roomB: "hall-a" },
      { id: "door-2", roomA: "hall-a", roomB: "vault" },
      { id: "door-3", roomA: "spawn", roomB: "hall-b" },
      { id: "door-4", roomA: "hall-b", roomB: "vault" },
      { id: "door-5", roomA: "vault", roomB: "extraction" },
    ],
  },
  entities: [],
  items: [],
  rules: {
    noiseTable: { move: 1 },
    alertThresholds: [0, 2, 4],
    noiseDecayRate: 1,
    maxAlertLevel: 3,
    captureOnMaxAlert: true,
  },
  scoring: {
    objectiveSecured: 100,
    extractionBonus: 50,
    turnsRemainingMultiplier: 1,
    lootMultiplier: 0.5,
    alertPenaltyPerLevel: 10,
    invalidActionPenalty: 5,
  },
  winCondition: {
    requiredObjectives: [],
    extractionRoomId: "extraction",
    maxTurns: 3,
    maxAlertLevel: 3,
  },
});

describe("validateHeistScenario", () => {
  it("accepts a minimal valid scenario", () => {
    const result = validateHeistScenario(baseScenario());
    expect(result.ok).toBe(true);
  });

  it("uses doors as the only adjacency truth", () => {
    const scenario = baseScenario();
    const result = validateHeistScenario(scenario);
    expect(result.ok).toBe(true);
  });

  it("flags doors that reference missing rooms", () => {
    const scenario = baseScenario();
    scenario.map.doors[0] = { id: "door-1", roomA: "spawn", roomB: "missing" };
    const result = validateHeistScenario(scenario);
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "HEIST_GRAPH_DOOR_BAD_ENDPOINT",
    );
  });

  it("detects hard-locks when a key is behind its own door", () => {
    const scenario = baseScenario();
    scenario.map.rooms = [
      { id: "spawn", type: "spawn" },
      { id: "vault", type: "vault" },
      { id: "extraction", type: "extraction" },
    ];
    scenario.items = [{ id: "key-1", type: "keycard", roomId: "vault" }];
    scenario.map.doors = [
      { id: "door-1", roomA: "spawn", roomB: "vault", locked: true, requiredItem: "key-1" },
      { id: "door-2", roomA: "vault", roomB: "extraction" },
    ];
    const result = validateHeistScenario(scenario);
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("HEIST_HARDLOCK_DETECTED");
  });

  it("flags missing spawn to vault reachability", () => {
    const scenario = baseScenario();
    scenario.map.doors = [
      { id: "door-1", roomA: "spawn", roomB: "hall-a" },
      { id: "door-2", roomA: "hall-a", roomB: "extraction" },
    ];
    const result = validateHeistScenario(scenario);
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("HEIST_PATH_NO_SPAWN_TO_VAULT");
  });

  it("flags scenarios where the shortest path exceeds max turns", () => {
    const scenario = baseScenario();
    scenario.winCondition.maxTurns = 1;
    const result = validateHeistScenario(scenario);
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("HEIST_PATH_TOO_LONG");
  });
});
