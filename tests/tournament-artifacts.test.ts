import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import { stableStringify } from "../src/core/json.js";
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
        if (
          file.endsWith("match_manifest.json") ||
          file === "tournament_manifest.json" ||
          file === "tournament.json"
        ) {
          const parsedA = JSON.parse(a) as { createdAt?: string };
          const parsedB = JSON.parse(b) as { createdAt?: string };
          delete parsedA.createdAt;
          delete parsedB.createdAt;
          expect(stableStringify(parsedA)).toBe(stableStringify(parsedB));
        } else {
          expect(a).toBe(b);
        }
      }
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});

describe("Tournament artifacts manifest", () => {
  it("writes tournament_manifest.json and tournament.json with a single trailing newline", () => {
    const config = makeConfig({ seed: 33 });
    const dir = mkdtempSync(join(tmpdir(), "agent-league-tournament-manifest-"));

    try {
      const result = runTournament(config);
      writeTournamentArtifacts(result, dir);

      const manifestRaw = readFileSync(join(dir, "tournament_manifest.json"), "utf-8");
      const legacyRaw = readFileSync(join(dir, "tournament.json"), "utf-8");

      expect(manifestRaw).toBe(legacyRaw);
      expect(manifestRaw.endsWith("\n")).toBe(true);
      expect(manifestRaw.endsWith("\n\n")).toBe(false);

      const manifest = JSON.parse(manifestRaw) as {
        tournamentSeed: number;
        scenarioName: string;
        agents: string[];
        matches: Array<{ matchKey: string }>;
        createdAt: string;
      };

      expect(manifest.tournamentSeed).toBe(result.tournament.tournamentSeed);
      expect(manifest.scenarioName).toBe(result.tournament.scenarioName);
      expect(manifest.agents).toEqual(result.tournament.agents);
      expect(manifest.matches).toHaveLength(result.tournament.matches.length);
      expect(typeof manifest.createdAt).toBe("string");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes match_manifest.json with required fields", () => {
    const config = makeConfig({ seed: 55 });
    const dir = mkdtempSync(join(tmpdir(), "agent-league-manifest-"));

    try {
      const result = runTournament(config);
      writeTournamentArtifacts(result, dir);

      const matchDir = join(dir, "matches", result.matchSummaries[0].matchKey);
      const raw = readFileSync(join(matchDir, "match_manifest.json"), "utf-8");

      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);

      const manifest = JSON.parse(raw) as {
        matchId: string;
        modeProfileId: string;
        scenario: { id: string; version: string | null; contractVersion: string | null };
        agents: Array<{ id: string; version: string | null }>;
        config: { maxTurns: number; seed: number; seedDerivationInputs: Record<string, unknown> };
        runner: { name: string; version: string | null; gitCommit: string | null };
        createdAt: string;
      };

      expect(manifest.matchId).toBe(result.matchSummaries[0].matchId);
      expect(manifest.modeProfileId).toBe("sandbox");
      expect(manifest.scenario.id).toBe(result.tournament.scenarioName);
      expect(manifest.scenario.contractVersion).toBeNull();
      expect(manifest.agents).toHaveLength(2);
      expect(manifest.config.maxTurns).toBe(result.config.maxTurns);
      expect(manifest.config.seed).toBe(result.matchSummaries[0].seed);
      expect(manifest.config.seedDerivationInputs).toEqual({
        tournamentSeed: result.tournament.tournamentSeed,
        matchKey: result.matchSummaries[0].matchKey,
      });
      expect(manifest.runner.name).toBe("tournament-harness");
      expect(typeof manifest.createdAt).toBe("string");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
