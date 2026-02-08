import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import { hashFile, hashManifestCore } from "../src/core/hash.js";
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
  it("writes byte-identical artifacts for identical inputs", async () => {
    const config = makeConfig({ seed: 123 });

    const dirA = mkdtempSync(join(tmpdir(), "hashmatch-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "hashmatch-b-"));

    try {
      const resultA = await runTournament(config);
      const resultB = await runTournament(config);

      await writeTournamentArtifacts(resultA, dirA);
      await writeTournamentArtifacts(resultB, dirB);

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
  it("writes tournament_manifest.json and tournament.json with a single trailing newline", async () => {
    const config = makeConfig({ seed: 33 });
    const dir = mkdtempSync(join(tmpdir(), "hashmatch-tournament-manifest-"));

    try {
      const result = await runTournament(config);
      await writeTournamentArtifacts(result, dir);

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

  it("writes match_manifest.json with required fields", async () => {
    const config = makeConfig({ seed: 55 });
    const dir = mkdtempSync(join(tmpdir(), "hashmatch-manifest-"));

    try {
      const result = await runTournament(config);
      await writeTournamentArtifacts(result, dir);

      const matchDir = join(dir, "matches", result.matchSummaries[0].matchKey);
      const raw = readFileSync(join(matchDir, "match_manifest.json"), "utf-8");

      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);

      const manifest = JSON.parse(raw) as {
        matchId: string;
        modeProfileId: string;
        scenario: {
          id: string;
          version: string;
          contractVersion: string | null;
          contentHash: string;
        };
        agents: Array<{ id: string; version: string; contentHash: string }>;
        config: { maxTurns: number; seed: number; seedDerivationInputs: Record<string, unknown> };
        runner: { name: string; version: string | null; gitCommit: string | null };
        createdAt: string;
      };

      expect(manifest.matchId).toBe(result.matchSummaries[0].matchId);
      expect(manifest.modeProfileId).toBe("sandbox");
      expect(manifest.scenario.id).toBe(result.tournament.scenarioName);
      expect(manifest.scenario.contractVersion).toBeNull();
      expect(typeof manifest.scenario.version).toBe("string");
      expect(typeof manifest.scenario.contentHash).toBe("string");
      expect(manifest.agents).toHaveLength(2);
      for (const agent of manifest.agents) {
        expect(typeof agent.version).toBe("string");
        expect(typeof agent.contentHash).toBe("string");
      }
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

describe("Tournament artifact hashing", () => {
  const hashRegex = /^sha256:[a-f0-9]{64}$/;

  it("adds hashes to match_summary.json and tournament_manifest.json", async () => {
    const config = makeConfig({ seed: 77 });
    const dir = mkdtempSync(join(tmpdir(), "hashmatch-hashes-"));

    try {
      const result = await runTournament(config);
      await writeTournamentArtifacts(result, dir);

      const matchDir = join(dir, "matches", result.matchSummaries[0].matchKey);
      const summaryRaw = readFileSync(join(matchDir, "match_summary.json"), "utf-8");
      expect(summaryRaw.endsWith("\n")).toBe(true);
      expect(summaryRaw.endsWith("\n\n")).toBe(false);

      const summary = JSON.parse(summaryRaw) as {
        hashes?: { logHash: string; manifestHash: string };
      };
      expect(summary.hashes).toBeDefined();
      expect(summary.hashes?.logHash).toMatch(hashRegex);
      expect(summary.hashes?.manifestHash).toMatch(hashRegex);

      const tournamentRaw = readFileSync(join(dir, "tournament_manifest.json"), "utf-8");
      expect(tournamentRaw.endsWith("\n")).toBe(true);
      expect(tournamentRaw.endsWith("\n\n")).toBe(false);
      const tournamentManifest = JSON.parse(tournamentRaw) as { truthBundleHash?: string };
      expect(tournamentManifest.truthBundleHash).toMatch(hashRegex);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hashes match.jsonl bytes and keeps hashes deterministic", async () => {
    const config = makeConfig({ seed: 88 });
    const dirA = mkdtempSync(join(tmpdir(), "hashmatch-hashes-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "hashmatch-hashes-b-"));

    try {
      const resultA = await runTournament(config);
      const resultB = await runTournament(config);
      await writeTournamentArtifacts(resultA, dirA);
      await writeTournamentArtifacts(resultB, dirB);

      const matchKey = resultA.matchSummaries[0].matchKey;
      const summaryRawA = readFileSync(
        join(dirA, "matches", matchKey, "match_summary.json"),
        "utf-8",
      );
      const summaryRawB = readFileSync(
        join(dirB, "matches", matchKey, "match_summary.json"),
        "utf-8",
      );
      const summaryA = JSON.parse(summaryRawA) as {
        hashes: { logHash: string; manifestHash: string };
      };
      const summaryB = JSON.parse(summaryRawB) as {
        hashes: { logHash: string; manifestHash: string };
      };

      expect(summaryA.hashes.logHash).toBe(summaryB.hashes.logHash);
      expect(summaryA.hashes.manifestHash).toBe(summaryB.hashes.manifestHash);

      const matchJsonlPath = join(dirA, "matches", matchKey, "match.jsonl");
      const computedLogHash = await hashFile(matchJsonlPath);
      expect(summaryA.hashes.logHash).toBe(computedLogHash);

      const tournamentRawA = readFileSync(join(dirA, "tournament_manifest.json"), "utf-8");
      const tournamentRawB = readFileSync(join(dirB, "tournament_manifest.json"), "utf-8");
      const tournamentManifestA = JSON.parse(tournamentRawA) as { truthBundleHash?: string };
      const tournamentManifestB = JSON.parse(tournamentRawB) as { truthBundleHash?: string };
      expect(tournamentManifestA.truthBundleHash).toBe(tournamentManifestB.truthBundleHash);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  it("ignores createdAt when hashing manifest core", () => {
    const baseManifest = {
      matchId: "match-1",
      createdAt: "2024-01-01T00:00:00.000Z",
      config: { seed: 123 },
    };
    const sameCoreDifferentCreated = {
      matchId: "match-1",
      createdAt: "2024-02-01T00:00:00.000Z",
      config: { seed: 123 },
    };
    const differentCore = {
      matchId: "match-1",
      createdAt: "2024-01-01T00:00:00.000Z",
      config: { seed: 999 },
    };

    const hashA = hashManifestCore(baseManifest);
    const hashB = hashManifestCore(sameCoreDifferentCreated);
    const hashC = hashManifestCore(differentCore);

    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
    expect(hashA).toMatch(hashRegex);
  });
});
