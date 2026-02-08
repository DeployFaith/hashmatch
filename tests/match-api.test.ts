import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listMatches } from "../src/app/api/matches/route.js";
import { GET as getMatchDetail } from "../src/app/api/matches/[matchId]/route.js";
import { GET as getMatchStatus } from "../src/app/api/matches/[matchId]/status/route.js";
import type { MatchStatusRecord, MatchSummaryRecord } from "../src/lib/matches/types.js";

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

function writeMatchStatus(matchId: string, status: MatchStatusRecord): void {
  const matchDir = join(tempDir, matchId);
  mkdirSync(matchDir, { recursive: true });
  writeFileSync(join(matchDir, "match_status.json"), JSON.stringify(status), "utf-8");
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "match-api-"));
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
      params: Promise.resolve({ matchId: MATCH_ID }),
    });

    expect(response.status).toBe(404);
  });
});

describe("GET /api/matches/[matchId]/status", () => {
  it("maps running status", async () => {
    writeMatchArtifacts(MATCH_ID);
    writeMatchStatus(MATCH_ID, {
      matchId: MATCH_ID,
      status: "running",
      startedAt: "2024-01-01T00:00:00.000Z",
    });

    const response = await getMatchStatus(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: MATCH_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "running",
      startedAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("maps completed status", async () => {
    const completedId = "m_abcd1234ef56";
    writeMatchArtifacts(completedId);
    writeMatchStatus(completedId, {
      matchId: completedId,
      status: "complete",
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: "2024-01-01T00:10:00.000Z",
      exitCode: 0,
    });

    const response = await getMatchStatus(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: completedId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "completed",
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: "2024-01-01T00:10:00.000Z",
      exitCode: 0,
    });
  });
});
