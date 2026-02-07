import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import { stableStringify } from "../src/core/json.js";
import { runVerifyTournamentCli } from "../src/cli/verify-tournament.js";
import type { TournamentConfig } from "../src/tournament/types.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 2025,
    maxTurns: 20,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

async function setupTournamentDir() {
  const dir = mkdtempSync(join(tmpdir(), "agent-league-verify-tour-"));
  const result = runTournament(makeConfig());
  await writeTournamentArtifacts(result, dir);
  const matchKey = result.matchSummaries[0].matchKey;
  const matchDir = join(dir, "matches", matchKey);
  return { dir, matchDir };
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${stableStringify(data)}\n`, "utf-8");
}

describe("verify-tournament", () => {
  it("passes for an intact tournament directory", async () => {
    const { dir } = await setupTournamentDir();
    try {
      const exitCode = await runVerifyTournamentCli(["--path", dir]);
      expect(exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when a match log is modified", async () => {
    const { dir, matchDir } = await setupTournamentDir();
    try {
      appendFileSync(join(matchDir, "match.jsonl"), "x");
      const exitCode = await runVerifyTournamentCli(["--path", dir]);
      expect(exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when tournament alias bytes differ", async () => {
    const { dir } = await setupTournamentDir();
    try {
      appendFileSync(join(dir, "tournament.json"), "x");
      const exitCode = await runVerifyTournamentCli(["--path", dir]);
      expect(exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when truthBundleHash is missing", async () => {
    const { dir } = await setupTournamentDir();
    try {
      const manifestPath = join(dir, "tournament_manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      delete manifest.truthBundleHash;
      writeJson(manifestPath, manifest);
      writeJson(join(dir, "tournament.json"), manifest);

      const exitCode = await runVerifyTournamentCli(["--path", dir]);
      expect(exitCode).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when truthBundleHash is wrong", async () => {
    const { dir } = await setupTournamentDir();
    try {
      const manifestPath = join(dir, "tournament_manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      manifest.truthBundleHash = "sha256:deadbeef";
      writeJson(manifestPath, manifest);
      writeJson(join(dir, "tournament.json"), manifest);

      const exitCode = await runVerifyTournamentCli(["--path", dir]);
      expect(exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when matches directory is missing", async () => {
    const { dir } = await setupTournamentDir();
    try {
      rmSync(join(dir, "matches"), { recursive: true, force: true });
      const exitCode = await runVerifyTournamentCli(["--path", dir]);
      expect(exitCode).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
