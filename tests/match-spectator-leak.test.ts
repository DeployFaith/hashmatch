import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listMatches } from "../src/app/api/matches/route.js";
import { GET as getMatchDetail } from "../src/app/api/matches/[matchId]/route.js";
import type { MatchSummaryRecord } from "../src/lib/matches/types.js";

let tempDir = "";
let exhibitionDir = "";

const MATCH_ID = "m_abc123def456";

function writeMatchArtifacts(matchId: string): void {
  const matchDir = join(tempDir, matchId);
  mkdirSync(matchDir, { recursive: true });

  const summary: MatchSummaryRecord = {
    matchId,
    matchKey: matchId,
    seed: 123,
    agentIds: ["noop-0", "noop-1"],
    scores: {
      "noop-0": 10,
      "noop-1": 5,
    },
    timeoutsPerAgent: {
      "noop-0": 0,
      "noop-1": 0,
    },
    winner: "noop-0",
    turns: 12,
    reason: "completed",
    hashes: {
      logHash: "hash-log",
      manifestHash: "hash-manifest",
    },
  };

  writeFileSync(join(matchDir, "match_summary.json"), JSON.stringify(summary), "utf-8");
  writeFileSync(
    join(matchDir, "match_manifest.json"),
    JSON.stringify({ scenario: { id: "Heist" } }),
    "utf-8",
  );
}

function hasPrivateKey(value: unknown): boolean {
  if (!value) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasPrivateKey(entry));
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "_private") {
        return true;
      }
      if (hasPrivateKey(entry)) {
        return true;
      }
    }
  }
  return false;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "match-spectator-"));
  exhibitionDir = mkdtempSync(join(tmpdir(), "match-exhibitions-"));
  process.env.MATCH_STORAGE_DIR = tempDir;
  process.env.EXHIBITION_STORAGE_DIR = exhibitionDir;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  if (exhibitionDir) {
    rmSync(exhibitionDir, { recursive: true, force: true });
  }
  delete process.env.MATCH_STORAGE_DIR;
  delete process.env.EXHIBITION_STORAGE_DIR;
});

describe("spectator API responses", () => {
  it("never include _private keys", async () => {
    writeMatchArtifacts(MATCH_ID);

    const listResponse = await listMatches();
    const listPayload = (await listResponse.json()) as unknown;
    expect(hasPrivateKey(listPayload)).toBe(false);

    const detailResponse = await getMatchDetail(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: MATCH_ID }),
    });
    const detailPayload = (await detailResponse.json()) as unknown;
    expect(hasPrivateKey(detailPayload)).toBe(false);
  });
});
