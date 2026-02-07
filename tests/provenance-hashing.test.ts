import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import { computeArtifactContentHash } from "../src/core/hash.js";
import type { TournamentConfig } from "../src/tournament/types.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 101,
    maxTurns: 15,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

describe("Match manifest provenance hashes", () => {
  const hashRegex = /^sha256:[a-f0-9]{64}$/;

  it("writes scenario and agent content hashes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-league-provenance-"));

    try {
      const result = runTournament(makeConfig());
      await writeTournamentArtifacts(result, dir);

      const matchDir = join(dir, "matches", result.matchSummaries[0].matchKey);
      const raw = readFileSync(join(matchDir, "match_manifest.json"), "utf-8");
      const manifest = JSON.parse(raw) as {
        scenario: { contentHash: string; version: string };
        agents: Array<{ contentHash: string; version: string }>;
      };

      expect(manifest.scenario.contentHash).toMatch(hashRegex);
      expect(manifest.scenario.version).toBeTruthy();
      for (const agent of manifest.agents) {
        expect(agent.contentHash).toMatch(hashRegex);
        expect(agent.version).toBeTruthy();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps scenario and agent content hashes stable across runs", async () => {
    const dirA = mkdtempSync(join(tmpdir(), "agent-league-provenance-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "agent-league-provenance-b-"));

    try {
      const config = makeConfig({ seed: 202 });
      const resultA = runTournament(config);
      const resultB = runTournament(config);

      await writeTournamentArtifacts(resultA, dirA);
      await writeTournamentArtifacts(resultB, dirB);

      const matchKey = resultA.matchSummaries[0].matchKey;
      const rawA = readFileSync(join(dirA, "matches", matchKey, "match_manifest.json"), "utf-8");
      const rawB = readFileSync(join(dirB, "matches", matchKey, "match_manifest.json"), "utf-8");
      const manifestA = JSON.parse(rawA) as {
        scenario: { contentHash: string };
        agents: Array<{ contentHash: string }>;
      };
      const manifestB = JSON.parse(rawB) as {
        scenario: { contentHash: string };
        agents: Array<{ contentHash: string }>;
      };

      expect(manifestA.scenario.contentHash).toBe(manifestB.scenario.contentHash);
      expect(manifestA.agents.map((agent) => agent.contentHash)).toEqual(
        manifestB.agents.map((agent) => agent.contentHash),
      );
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});

describe("Artifact content hash helper", () => {
  it("changes when underlying files change", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-league-artifact-hash-"));

    try {
      const filePath = join(dir, "artifact.txt");
      writeFileSync(filePath, "alpha", "utf-8");

      const hashA = await computeArtifactContentHash({
        rootDir: dir,
        includePaths: ["artifact.txt"],
      });

      writeFileSync(filePath, "bravo", "utf-8");

      const hashB = await computeArtifactContentHash({
        rootDir: dir,
        includePaths: ["artifact.txt"],
      });

      expect(hashA).not.toBe(hashB);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
