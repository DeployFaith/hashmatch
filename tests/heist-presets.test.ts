import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runScenarioCli } from "../src/cli/scenario.js";
import { validateHeistScenario } from "../src/games/heist/validator.js";

type PresetExpectation = {
  roomsMin: number;
  roomsMax: number;
  guards: number;
  cameras: number;
  terminals: number;
};

const presetExpectations: Record<string, PresetExpectation> = {
  warehouse_breakin: { roomsMin: 5, roomsMax: 8, guards: 1, cameras: 1, terminals: 1 },
  prison_escape: { roomsMin: 8, roomsMax: 12, guards: 2, cameras: 2, terminals: 2 },
  museum_night: { roomsMin: 10, roomsMax: 15, guards: 3, cameras: 3, terminals: 3 },
};

const scenarioFiles = [
  "museum_night_seed8.scenario.json",
  "museum_night_seed15.scenario.json",
  "museum_night_seed19.scenario.json",
  "prison_escape_seed2.scenario.json",
  "prison_escape_seed8.scenario.json",
  "prison_escape_seed15.scenario.json",
  "warehouse_breakin_seed3.scenario.json",
  "warehouse_breakin_seed8.scenario.json",
  "warehouse_breakin_seed15.scenario.json",
].map((file) => join("scenarios", "heist", file));

const createTempDir = (): string => mkdtempSync(join(tmpdir(), "hashmatch-heist-presets-"));

const getPresetName = (path: string): string => {
  const match = Object.keys(presetExpectations).find((preset) => path.includes(preset));
  if (!match) {
    throw new Error(`Unknown preset for scenario file: ${path}`);
  }
  return match;
};

describe("heist preset scenarios", () => {
  it("ships curated scenarios that validate and match preset expectations", () => {
    for (const file of scenarioFiles) {
      const scenario = JSON.parse(readFileSync(file, "utf-8")) as { params: any };
      const validation = validateHeistScenario(scenario.params);
      expect(validation.ok).toBe(true);

      const preset = getPresetName(file);
      const expectation = presetExpectations[preset];
      const roomCount = scenario.params.map.rooms.length;
      expect(roomCount).toBeGreaterThanOrEqual(expectation.roomsMin);
      expect(roomCount).toBeLessThanOrEqual(expectation.roomsMax);

      const guardCount = scenario.params.entities.filter((entity: any) => entity.type === "guard").length;
      const cameraCount = scenario.params.entities.filter((entity: any) => entity.type === "camera").length;
      const terminalCount = scenario.params.entities.filter((entity: any) => entity.type === "terminal").length;
      expect(guardCount).toBe(expectation.guards);
      expect(cameraCount).toBe(expectation.cameras);
      expect(terminalCount).toBe(expectation.terminals);

      const typeCounts = scenario.params.map.rooms.reduce(
        (acc: Record<string, number>, room: { type: string }) => {
          acc[room.type] = (acc[room.type] ?? 0) + 1;
          return acc;
        },
        {},
      );
      expect(typeCounts.spawn ?? 0).toBe(1);
      expect(typeCounts.vault ?? 0).toBe(1);
      expect(typeCounts.extraction ?? 0).toBe(1);

      const intelCount = scenario.params.items.filter((item: any) => item.type === "intel").length;
      const objectiveCount = scenario.params.winCondition.requiredObjectives.length;
      expect(intelCount).toBe(objectiveCount);
    }
  });

  it("matches the warehouse_breakin seed=3 fixture snapshot", () => {
    const baseDir = createTempDir();
    const outDir = join(baseDir, "scenario");
    const result = runScenarioCli([
      "gen",
      "--game",
      "heist",
      "--seed",
      "3",
      "--preset",
      "warehouse_breakin",
      "--out",
      outDir,
    ]);
    expect(result.code).toBe(0);

    const generated = readFileSync(join(outDir, "scenario.json"), "utf-8");
    const fixture = readFileSync(
      join("tests", "fixtures", "heist", "warehouse_breakin_seed3.scenario.json"),
      "utf-8",
    );
    expect(generated).toEqual(fixture);

    rmSync(baseDir, { recursive: true, force: true });
  });
});
