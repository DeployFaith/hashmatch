import { describe, expect, it } from "vitest";
import {
  appendFileSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import type { TournamentConfig } from "../src/tournament/types.js";
import { validateBundleDirectory } from "../src/cli/validate-bundle.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 101,
    maxTurns: 5,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

async function createTournamentDir(): Promise<{ dir: string; matchKey: string }> {
  const dir = mkdtempSync(join(tmpdir(), "hashmatch-validate-"));
  const result = await runTournament(makeConfig());
  await writeTournamentArtifacts(result, dir);
  return { dir, matchKey: result.matchSummaries[0].matchKey };
}

describe("validate-bundle CLI", () => {
  it("reports valid output with zero errors", async () => {
    const { dir } = await createTournamentDir();

    try {
      const report = await validateBundleDirectory(dir);
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when a listed match.jsonl is missing", async () => {
    const { dir, matchKey } = await createTournamentDir();
    const matchJsonlPath = join(dir, "matches", matchKey, "match.jsonl");

    try {
      unlinkSync(matchJsonlPath);
      const report = await validateBundleDirectory(dir);
      expect(report.valid).toBe(false);
      expect(report.errors.join(" ")).toContain("match.jsonl");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when a match log hash mismatches", async () => {
    const { dir, matchKey } = await createTournamentDir();
    const matchJsonlPath = join(dir, "matches", matchKey, "match.jsonl");

    try {
      appendFileSync(matchJsonlPath, "x", "utf-8");
      const report = await validateBundleDirectory(dir);
      expect(report.valid).toBe(false);
      expect(report.errors.join(" ")).toContain("logHash mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("warns about unlisted files but remains valid", async () => {
    const { dir } = await createTournamentDir();
    const notesPath = join(dir, "notes.txt");

    try {
      writeFileSync(notesPath, "notes", "utf-8");
      const report = await validateBundleDirectory(dir);
      expect(report.valid).toBe(true);
      expect(report.warnings.join(" ")).toContain("notes.txt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores OS junk files", async () => {
    const { dir } = await createTournamentDir();
    const junkPath = join(dir, ".DS_Store");

    try {
      writeFileSync(junkPath, "junk", "utf-8");
      const report = await validateBundleDirectory(dir);
      expect(report.warnings.join(" ")).not.toContain(".DS_Store");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when broadcast_manifest.json is missing", async () => {
    const { dir } = await createTournamentDir();
    const manifestPath = join(dir, "broadcast_manifest.json");

    try {
      unlinkSync(manifestPath);
      const report = await validateBundleDirectory(dir);
      expect(report.valid).toBe(false);
      expect(report.errors.join(" ")).toContain("broadcast_manifest.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
