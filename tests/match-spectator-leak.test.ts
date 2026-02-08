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
  process.env.HASHMATCH_DATA_DIR = tempDir;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.HASHMATCH_DATA_DIR;
});

describe("spectator API responses", () => {
  it("never include _private keys", async () => {
    writeMatchStatus(MATCH_ID, {
      matchId: MATCH_ID,
      status: "running",
      scenario: "numberGuess",
      agents: ["noop-0", "noop-1"],
      startedAt: "2024-01-01T00:00:00.000Z",
      finishedAt: null,
      verified: null,
      totalTurns: 12,
      currentTurn: 3,
    });

    const listResponse = await listMatches();
    const listPayload = (await listResponse.json()) as unknown;
    expect(hasPrivateKey(listPayload)).toBe(false);

    const statusResponse = await getMatchStatus(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: MATCH_ID }),
    });
    const statusPayload = (await statusResponse.json()) as unknown;
    expect(hasPrivateKey(statusPayload)).toBe(false);
  });
});
