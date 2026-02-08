import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/core/json.js";
import { runScenarioCli } from "../src/cli/scenario.js";

const createTempDir = (): string => mkdtempSync(join(tmpdir(), "hashmatch-heist-scenario-"));

describe("heist scenario CLI", () => {
  it("generates, validates, previews, and describes scenarios", () => {
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

    const scenarioPath = join(outDir, "scenario.json");
    const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8")) as {
      params: { map: { rooms: { id: string }[] } };
    };
    expect(scenario.params.map.rooms.length).toBeGreaterThan(0);

    const preview = runScenarioCli(["preview", "--path", scenarioPath]);
    expect(preview.code).toBe(0);
    expect(preview.stdout.length).toBeGreaterThan(0);
    expect(preview.stdout).toContain(scenario.params.map.rooms[0].id);

    const description = runScenarioCli(["describe", "--path", scenarioPath]);
    expect(description.code).toBe(0);
    expect(description.stdout.length).toBeGreaterThan(0);

    rmSync(baseDir, { recursive: true, force: true });
  });

  it("validates scenarios and rejects corrupted files", () => {
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
      "--validate",
    ]);
    expect(result.code).toBe(0);

    const scenarioPath = join(outDir, "scenario.json");
    const validate = runScenarioCli(["validate", "--path", scenarioPath]);
    expect(validate.code).toBe(0);

    const corruptedPath = join(baseDir, "scenario-corrupt.json");
    const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8")) as {
      params: { map: { rooms: { id: string }[] }; winCondition: { extractionRoomId: string } };
    };
    scenario.params.map.rooms = scenario.params.map.rooms.filter(
      (room) => room.id !== scenario.params.winCondition.extractionRoomId,
    );
    writeFileSync(corruptedPath, `${stableStringify(scenario)}\n`, "utf-8");

    const invalid = runScenarioCli(["validate", "--path", corruptedPath]);
    expect(invalid.code).toBe(1);

    rmSync(baseDir, { recursive: true, force: true });
  });

  it("produces deterministic scenario.json bytes for the same seed", () => {
    const baseDir = createTempDir();
    const outDirA = join(baseDir, "scenario-a");
    const outDirB = join(baseDir, "scenario-b");

    const first = runScenarioCli([
      "gen",
      "--game",
      "heist",
      "--seed",
      "3",
      "--preset",
      "warehouse_breakin",
      "--out",
      outDirA,
    ]);
    const second = runScenarioCli([
      "gen",
      "--game",
      "heist",
      "--seed",
      "3",
      "--preset",
      "warehouse_breakin",
      "--out",
      outDirB,
    ]);

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);

    const outputA = readFileSync(join(outDirA, "scenario.json"), "utf-8");
    const outputB = readFileSync(join(outDirB, "scenario.json"), "utf-8");
    expect(outputA).toEqual(outputB);

    rmSync(baseDir, { recursive: true, force: true });
  });
});
