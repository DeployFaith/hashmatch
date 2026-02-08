import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listMatches } from "../src/app/api/matches/route.js";
import { GET as getMatchStatus } from "../src/app/api/matches/[matchId]/status/route.js";
import type { MatchLifecycleStatusRecord } from "../src/server/matchLifecycle.js";

let tempDir = "";

const MATCH_ID = "m_abc123def456";

function writeMatchStatus(matchId: string, status: MatchLifecycleStatusRecord): void {
  const matchDir = join(tempDir, "matches", matchId);
  mkdirSync(matchDir, { recursive: true });
  writeFileSync(join(matchDir, "match_status.json"), JSON.stringify(status), "utf-8");
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "match-api-"));
  process.env.HASHMATCH_DATA_DIR = tempDir;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.HASHMATCH_DATA_DIR;
});

describe("GET /api/matches", () => {
  it("returns [] when no artifacts exist", async () => {
    const response = await listMatches();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { matches: unknown[] };
    expect(payload).toEqual({ matches: [] });
  });

  it("returns match status entries when artifacts exist", async () => {
    writeMatchStatus(MATCH_ID, {
      matchId: MATCH_ID,
      status: "running",
      scenario: "numberGuess",
      agents: ["random-0", "baseline-1"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: null,
      verified: null,
      totalTurns: 12,
      currentTurn: 3,
    });

    const response = await listMatches();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { matches: Array<{ matchId: string }> };
    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0].matchId).toBe(MATCH_ID);
  });
});

describe("GET /api/matches/[matchId]/status", () => {
  it("returns stored status", async () => {
    writeMatchStatus(MATCH_ID, {
      matchId: MATCH_ID,
      status: "running",
      scenario: "numberGuess",
      agents: ["random-0", "baseline-1"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: null,
      verified: null,
      totalTurns: 12,
      currentTurn: 4,
    });

    const response = await getMatchStatus(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: MATCH_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      matchId: MATCH_ID,
      status: "running",
      scenario: "numberGuess",
      agents: ["random-0", "baseline-1"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: null,
      verified: null,
      totalTurns: 12,
      currentTurn: 4,
    });
  });
});
