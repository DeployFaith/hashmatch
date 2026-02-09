import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMatchWithArtifacts } from "../src/tournament/runMatchWithArtifacts.js";
import { LlmPreflightError } from "../src/agents/llm/preflight.js";

describe("preflight failure artifacts", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("writes match.jsonl and match_status.json on preflight failure", async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const tempBase = mkdtempSync(join(tmpdir(), "hm-preflight-"));
    const outDir = join(tempBase, "match-output");
    tempDirs.push(tempBase);

    try {
      await expect(
        runMatchWithArtifacts({
          scenarioKey: "numberGuess",
          agentKeys: ["llm:openrouter:gpt-4o-mini", "noop"],
          seed: 42,
          maxTurns: 10,
          outDir,
        }),
      ).rejects.toThrow(LlmPreflightError);

      // outDir must exist
      expect(existsSync(outDir)).toBe(true);

      // -- match.jsonl --------------------------------------------------
      const jsonlPath = join(outDir, "match.jsonl");
      expect(existsSync(jsonlPath)).toBe(true);

      const jsonlContent = readFileSync(jsonlPath, "utf-8");
      const lines = jsonlContent.split("\n").filter((l) => l.trim() !== "");
      expect(lines.length).toBe(2);

      // Each line must parse independently as valid JSON (no malformed output)
      const events = lines.map((line, i) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          throw new Error(`Line ${i + 1} is not valid JSON: ${line}`);
        }
      });

      // First event: MatchSetupFailed
      expect(events[0].type).toBe("MatchSetupFailed");
      expect(events[0].seq).toBe(0);
      expect(typeof events[0].matchId).toBe("string");
      expect(typeof events[0].message).toBe("string");
      expect(Array.isArray(events[0].details)).toBe(true);

      // Second event: MatchEnded with reason "setupFailed"
      expect(events[1].type).toBe("MatchEnded");
      expect(events[1].seq).toBe(1);
      expect(events[1].matchId).toBe(events[0].matchId);
      expect(events[1].reason).toBe("setupFailed");
      expect(events[1].scores).toEqual({});
      expect(events[1].turns).toBe(0);

      // -- match_status.json --------------------------------------------
      const statusPath = join(outDir, "match_status.json");
      expect(existsSync(statusPath)).toBe(true);

      const status = JSON.parse(readFileSync(statusPath, "utf-8")) as Record<string, unknown>;
      expect(status.status).toBe("failed");
      expect(typeof status.matchId).toBe("string");
      expect(typeof status.startedAt).toBe("string");
      expect(typeof status.endedAt).toBe("string");
      expect(typeof status.error).toBe("string");

      // -- match_manifest.json ------------------------------------------
      const manifestPath = join(outDir, "match_manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      expect(typeof manifest.matchId).toBe("string");
      expect(typeof manifest.modeProfileId).toBe("string");

      // -- match_summary.json -------------------------------------------
      const summaryPath = join(outDir, "match_summary.json");
      expect(existsSync(summaryPath)).toBe(true);
      const summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as Record<string, unknown>;
      expect(summary.reason).toBe("setupFailed");
      expect(typeof summary.error).toBe("string");
      const hashes = summary.hashes as { logHash?: unknown; manifestHash?: unknown };
      expect(typeof hashes?.logHash).toBe("string");
      expect(typeof hashes?.manifestHash).toBe("string");
    } finally {
      if (originalKey !== undefined) {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
    }
  });

  it("uses provided matchId in failure artifacts", async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const tempBase = mkdtempSync(join(tmpdir(), "hm-preflight-id-"));
    const outDir = join(tempBase, "match-output");
    tempDirs.push(tempBase);

    try {
      await expect(
        runMatchWithArtifacts({
          scenarioKey: "numberGuess",
          agentKeys: ["llm:openrouter:gpt-4o-mini", "noop"],
          seed: 42,
          maxTurns: 10,
          outDir,
          matchId: "test-preflight-fail-id",
        }),
      ).rejects.toThrow(LlmPreflightError);

      const jsonlContent = readFileSync(join(outDir, "match.jsonl"), "utf-8");
      const events = jsonlContent
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(events[0].matchId).toBe("test-preflight-fail-id");
      expect(events[1].matchId).toBe("test-preflight-fail-id");

      const status = JSON.parse(readFileSync(join(outDir, "match_status.json"), "utf-8")) as Record<
        string,
        unknown
      >;
      expect(status.matchId).toBe("test-preflight-fail-id");
    } finally {
      if (originalKey !== undefined) {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
    }
  });

  it("does not write artifacts when outDir is not specified", async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      await expect(
        runMatchWithArtifacts({
          scenarioKey: "numberGuess",
          agentKeys: ["llm:openrouter:gpt-4o-mini", "noop"],
          seed: 42,
          maxTurns: 10,
          // no outDir
        }),
      ).rejects.toThrow(LlmPreflightError);
    } finally {
      if (originalKey !== undefined) {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
    }
  });
});
