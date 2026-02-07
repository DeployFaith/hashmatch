import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/core/json.js";
import { generateHeistScenario } from "../src/games/heist/generator.js";
import { HeistScenarioParamsSchema } from "../src/games/heist/types.js";

const baseConfig = {
  rooms: { exact: 8 },
  branchingFactor: 2,
  loopCount: 2,
  securityDensity: { guards: 3, cameras: 2 },
  hazardsEnabled: false,
  maxTurns: 26,
  difficultyPreset: "normal",
  skin: { themeName: "blueprint" },
} as const;

describe("generateHeistScenario", () => {
  it("produces deterministic output for the same seed", () => {
    const first = generateHeistScenario(baseConfig, 1337);
    const second = generateHeistScenario(baseConfig, 1337);
    expect(second).toEqual(first);
    expect(stableStringify(second)).toEqual(stableStringify(first));
  });

  it("varies output for different seeds", () => {
    const first = generateHeistScenario(baseConfig, 111);
    const second = generateHeistScenario(baseConfig, 222);
    expect(stableStringify(first)).not.toEqual(stableStringify(second));
  });

  it("relies on doors as the adjacency source of truth", () => {
    const scenario = generateHeistScenario(baseConfig, 9001);
    for (const room of scenario.map.rooms) {
      expect("adjacent" in room).toBe(false);
    }
    expect(scenario.map.doors.length).toBeGreaterThan(0);
  });

  it("grants intel via terminals instead of room spawns", () => {
    const scenario = generateHeistScenario(baseConfig, 4242);
    const intelItems = scenario.items.filter((item) => item.type === "intel");
    expect(intelItems.length).toBeGreaterThan(0);
    for (const item of intelItems) {
      expect("roomId" in item).toBe(false);
    }
    const terminalGrants = scenario.entities
      .filter((entity) => entity.type === "terminal")
      .flatMap((terminal) => terminal.successGrants ?? []);
    for (const grant of terminalGrants) {
      const item = scenario.items.find((entry) => entry.id === grant);
      expect(item?.type).toBe("intel");
    }
  });

  it("produces params that satisfy the Heist schema", () => {
    const scenario = generateHeistScenario(baseConfig, 5150);
    const result = HeistScenarioParamsSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });
});
