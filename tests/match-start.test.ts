import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/matches/start/route.js";
import { MATCH_ID_PATTERN } from "../src/engine/matchId.js";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "match-start-"));
  process.env.MATCH_STORAGE_DIR = tempDir;
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.MATCH_STORAGE_DIR;
});

describe("POST /api/matches/start", () => {
  it("creates a match directory and writes match_status.json", async () => {
    const request = new Request("http://localhost/api/matches/start", {
      method: "POST",
      body: JSON.stringify({
        scenarioKey: "numberGuess",
        agentKeys: ["random", "baseline"],
        seed: 123,
        turns: 1,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { matchId: string };

    expect(MATCH_ID_PATTERN.test(payload.matchId)).toBe(true);

    const matchDir = join(tempDir, payload.matchId);
    expect(existsSync(matchDir)).toBe(true);

    const statusPath = join(matchDir, "match_status.json");
    const statusRaw = readFileSync(statusPath, "utf-8");
    const status = JSON.parse(statusRaw) as { status: string };
    expect(["running", "complete", "incomplete"]).toContain(status.status);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(existsSync(join(matchDir, "match_summary.json"))).toBe(true);
    expect(existsSync(join(matchDir, "match_manifest.json"))).toBe(true);
    expect(existsSync(join(matchDir, "match.jsonl"))).toBe(true);
  });

  it("rejects unknown scenario keys", async () => {
    const request = new Request("http://localhost/api/matches/start", {
      method: "POST",
      body: JSON.stringify({
        scenarioKey: "unknownScenario",
        agentKeys: ["random", "baseline"],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects unknown agent keys", async () => {
    const request = new Request("http://localhost/api/matches/start", {
      method: "POST",
      body: JSON.stringify({
        scenarioKey: "numberGuess",
        agentKeys: ["random", "notAnAgent"],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
