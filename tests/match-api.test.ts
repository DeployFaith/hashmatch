import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listMatches } from "../src/app/api/matches/route.js";
import { GET as getMatchDetail } from "../src/app/api/matches/[matchId]/route.js";
import type { MatchSummaryRecord } from "../src/lib/matches/types.js";

let tempDir = "";

const MATCH_ID = "m_abc123def456";

function writeMatchArtifacts(matchId: string): void {
  const matchDir = join(tempDir, matchId);
  mkdirSync(matchDir, { recursive: true });

  const summary: MatchSummaryRecord = {
    matchId,
    matchKey: matchId,
    seed: 123,
    agentIds: ["random-0", "baseline-1"],
    scores: {
      "random-0": 10,
      "baseline-1": 5,
    },
    winner: "random-0",
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

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "match-api-"));
  process.env.MATCH_STORAGE_DIR = tempDir;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.MATCH_STORAGE_DIR;
});

describe("GET /api/matches", () => {
  it("returns [] when no artifacts exist", async () => {
    const response = await listMatches();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as unknown[];
    expect(payload).toEqual([]);
  });

  it("returns match summaries when artifacts exist", async () => {
    writeMatchArtifacts(MATCH_ID);

    const response = await listMatches();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Array<{ matchId: string }>;
    expect(payload).toHaveLength(1);
    expect(payload[0].matchId).toBe(MATCH_ID);
  });
});

describe("GET /api/matches/[matchId]", () => {
  it("returns 404 when match summary is missing", async () => {
    const response = await getMatchDetail(new Request("http://localhost"), {
      params: { matchId: MATCH_ID },
    });

    expect(response.status).toBe(404);
  });
});
