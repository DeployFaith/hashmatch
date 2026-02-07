import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import { stableStringify } from "../src/core/json.js";
import { verifyMatchDirectory } from "../src/cli/verify-match.js";
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

async function setupMatchDir() {
  const dir = mkdtempSync(join(tmpdir(), "agent-league-verify-"));
  const result = runTournament(makeConfig());
  await writeTournamentArtifacts(result, dir);
  const matchKey = result.matchSummaries[0].matchKey;
  const matchDir = join(dir, "matches", matchKey);
  return { dir, matchDir };
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${stableStringify(data)}\n`, "utf-8");
}

describe("verify-match", () => {
  it("passes for an intact match directory", async () => {
    const { dir, matchDir } = await setupMatchDir();
    try {
      const report = await verifyMatchDirectory(matchDir);
      expect(report.exitCode).toBe(0);
      expect(report.status).toBe("pass");
      expect(report.logHash?.ok).toBe(true);
      expect(report.manifestHash?.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when match.jsonl is modified", async () => {
    const { dir, matchDir } = await setupMatchDir();
    try {
      appendFileSync(join(matchDir, "match.jsonl"), "x");
      const report = await verifyMatchDirectory(matchDir);
      expect(report.exitCode).toBe(1);
      expect(report.status).toBe("fail");
      expect(report.logHash?.ok).toBe(false);
      expect(report.manifestHash?.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when manifest core changes", async () => {
    const { dir, matchDir } = await setupMatchDir();
    try {
      const manifestPath = join(matchDir, "match_manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      const config = (manifest.config as { maxTurns?: number }) ?? {};
      config.maxTurns = (config.maxTurns ?? 0) + 1;
      manifest.config = config;
      writeJson(manifestPath, manifest);

      const report = await verifyMatchDirectory(matchDir);
      expect(report.exitCode).toBe(1);
      expect(report.status).toBe("fail");
      expect(report.manifestHash?.ok).toBe(false);
      expect(report.logHash?.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes when only createdAt changes", async () => {
    const { dir, matchDir } = await setupMatchDir();
    try {
      const manifestPath = join(matchDir, "match_manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      manifest.createdAt = new Date().toISOString();
      writeJson(manifestPath, manifest);

      const report = await verifyMatchDirectory(matchDir);
      expect(report.exitCode).toBe(0);
      expect(report.status).toBe("pass");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when match_manifest.json is missing", async () => {
    const { dir, matchDir } = await setupMatchDir();
    try {
      rmSync(join(matchDir, "match_manifest.json"));
      const report = await verifyMatchDirectory(matchDir);
      expect(report.exitCode).toBe(2);
      expect(report.status).toBe("error");
      expect(report.errors[0]).toContain("match_manifest.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when match_summary.json lacks hashes", async () => {
    const { dir, matchDir } = await setupMatchDir();
    try {
      const summaryPath = join(matchDir, "match_summary.json");
      const summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as Record<string, unknown>;
      delete summary.hashes;
      writeJson(summaryPath, summary);

      const report = await verifyMatchDirectory(matchDir);
      expect(report.exitCode).toBe(2);
      expect(report.status).toBe("error");
      expect(report.errors[0]).toContain("hashes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
