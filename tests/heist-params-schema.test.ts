import { describe, expect, it } from "vitest";
import { validateHeistScenarioParams } from "../src/games/heist/types.js";

const minimalParams = {
  map: {
    rooms: [
      { id: "spawn", type: "spawn" },
      { id: "vault", type: "vault" },
      { id: "extraction", type: "extraction" },
    ],
    doors: [
      { id: "door-1", roomA: "spawn", roomB: "vault" },
      { id: "door-2", roomA: "vault", roomB: "extraction" },
    ],
  },
  entities: [
    {
      id: "terminal-1",
      type: "terminal",
      roomId: "spawn",
      hackTurns: 2,
      successGrants: ["intel-1"],
    },
    {
      id: "vault-1",
      type: "vault",
      roomId: "vault",
      requiredItems: ["intel-1"],
    },
  ],
  items: [{ id: "intel-1", type: "intel", label: "fragment" }],
  rules: {
    noiseTable: { move: 1, interact: 2 },
    alertThresholds: [0, 3, 6, 10],
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
    requiredObjectives: ["intel-1"],
    extractionRoomId: "extraction",
    maxTurns: 30,
    maxAlertLevel: 3,
  },
  skin: {
    themeName: "blueprint",
  },
};

describe("HeistScenarioParamsSchema", () => {
  it("accepts minimal valid params", () => {
    const result = validateHeistScenarioParams(minimalParams);
    expect(result.ok).toBe(true);
  });

  it("accepts full valid params", () => {
    const fullParams = {
      ...minimalParams,
      map: {
        rooms: [
          { id: "spawn", type: "spawn" },
          { id: "security", type: "security" },
          { id: "vault", type: "vault" },
          { id: "extraction", type: "extraction" },
        ],
        doors: [
          { id: "door-1", roomA: "spawn", roomB: "security", alarmed: true },
          {
            id: "door-2",
            roomA: "security",
            roomB: "vault",
            locked: true,
            requiredItem: "keycard-1",
            noiseOnForce: 3,
          },
          { id: "door-3", roomA: "vault", roomB: "extraction" },
        ],
      },
      entities: [
        {
          id: "guard-1",
          type: "guard",
          patrolRoute: ["spawn", "security", "vault"],
          detectionRange: 1,
          alertResponse: "investigate",
        },
        {
          id: "camera-1",
          type: "camera",
          roomId: "security",
          range: 2,
        },
        {
          id: "terminal-1",
          type: "terminal",
          roomId: "security",
          hackTurns: 3,
          alarmOnFail: true,
          successGrants: ["intel-1"],
        },
        {
          id: "vault-1",
          type: "vault",
          roomId: "vault",
          requiredItems: ["intel-1"],
        },
      ],
      items: [
        { id: "intel-1", type: "intel" },
        { id: "keycard-1", type: "keycard", roomId: "spawn", level: 1 },
        { id: "tool-1", type: "tool", roomId: "security", toolType: "emp", uses: 1 },
        { id: "loot-1", type: "loot", roomId: "vault", scoreValue: 250 },
      ],
      winCondition: {
        requiredObjectives: ["intel-1"],
        extractionRoomId: "extraction",
        maxTurns: 40,
        maxAlertLevel: 3,
      },
    };

    const result = validateHeistScenarioParams(fullParams);
    expect(result.ok).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { rules: _rules, ...missingRules } = minimalParams;
    void _rules;
    const result = validateHeistScenarioParams(missingRules);
    expect(result.ok).toBe(false);
  });

  it("requires positions when layoutVersion is set", () => {
    const result = validateHeistScenarioParams({
      ...minimalParams,
      layoutVersion: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects doors with unknown endpoints", () => {
    const result = validateHeistScenarioParams({
      ...minimalParams,
      map: {
        ...minimalParams.map,
        doors: [{ id: "door-1", roomA: "spawn", roomB: "missing" }],
      },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects entities placed in unknown rooms", () => {
    const result = validateHeistScenarioParams({
      ...minimalParams,
      entities: [
        {
          id: "camera-1",
          type: "camera",
          roomId: "ghost",
          range: 1,
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects terminal grants for missing intel items", () => {
    const result = validateHeistScenarioParams({
      ...minimalParams,
      entities: [
        {
          id: "terminal-1",
          type: "terminal",
          roomId: "spawn",
          hackTurns: 2,
          successGrants: ["intel-missing"],
        },
        {
          id: "vault-1",
          type: "vault",
          roomId: "vault",
          requiredItems: ["intel-1"],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects vault requirements for missing items", () => {
    const result = validateHeistScenarioParams({
      ...minimalParams,
      entities: [
        {
          id: "terminal-1",
          type: "terminal",
          roomId: "spawn",
          hackTurns: 2,
          successGrants: ["intel-1"],
        },
        {
          id: "vault-1",
          type: "vault",
          roomId: "vault",
          requiredItems: ["intel-missing"],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate item ids", () => {
    const result = validateHeistScenarioParams({
      ...minimalParams,
      items: [
        { id: "intel-1", type: "intel" },
        { id: "intel-1", type: "intel", label: "dup" },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it.skip("rejects hard-lock dependency cycles (validator task)", () => {
    // TODO: Validator task will enforce reachability and prevent cycles/hard-locks.
    const result = validateHeistScenarioParams(minimalParams);
    expect(result.ok).toBe(false);
  });
});
