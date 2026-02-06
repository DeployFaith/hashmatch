import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import type { TournamentConfig } from "../src/tournament/types.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 42,
    maxTurns: 20,
    rounds: 2,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

function listFiles(dir: string, baseDir = dir): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, baseDir));
    } else {
      files.push(fullPath.slice(baseDir.length + 1));
    }
  }
  return files.sort();
}

describe("Tournament artifacts determinism", () => {
  it("writes byte-identical artifacts for identical inputs", () => {
    const config = makeConfig({ seed: 123 });

    const dirA = mkdtempSync(join(tmpdir(), "agent-league-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "agent-league-b-"));

    try {
      const resultA = runTournament(config);
      const resultB = runTournament(config);

      writeTournamentArtifacts(resultA, dirA);
      writeTournamentArtifacts(resultB, dirB);

      const filesA = listFiles(dirA);
      const filesB = listFiles(dirB);

      expect(filesA).toEqual(filesB);

      for (const file of filesA) {
        const a = readFileSync(join(dirA, file), "utf-8");
        const b = readFileSync(join(dirB, file), "utf-8");
        expect(a).toBe(b);
      }
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});
