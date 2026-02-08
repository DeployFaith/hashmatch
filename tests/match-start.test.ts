import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/matches/start/route.js";
import { buildOperatorMatchId } from "../src/server/operatorMatch.js";
import type { MatchLifecycleStatusRecord } from "../src/server/matchLifecycle.js";

vi.mock("node:crypto", () => ({
  randomBytes: () => Buffer.from("d3b07384d9a44f32", "hex"),
}));

let tempDir = "";
const scenario = "numberGuess";
const agents = ["random", "baseline"];
const totalTurns = 5;

function createStartRequest() {
  return new Request("http://localhost/api/matches/start", {
    method: "POST",
    body: JSON.stringify({
      scenario,
      agents,
      seed: 123,
      totalTurns,
    }),
  });
}

function readStatus(matchDir: string): MatchLifecycleStatusRecord {
  const statusPath = join(matchDir, "match_status.json");
  const statusRaw = readFileSync(statusPath, "utf-8");
  return JSON.parse(statusRaw) as MatchLifecycleStatusRecord;
}

async function waitForTerminalStatus(matchDir: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = readStatus(matchDir);
    if (status.status === "finished") {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for match to finish");
}

beforeAll(() => {
  const runnerPath = join(process.cwd(), "dist", "cli", "run-match.js");
  if (!existsSync(runnerPath)) {
    execSync("npm run build:engine", { stdio: "inherit" });
  }
});

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "match-start-"));
  process.env.HASHMATCH_DATA_DIR = tempDir;
  process.env.HASHMATCH_OPERATOR_MODE = "true";
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.HASHMATCH_DATA_DIR;
  delete process.env.HASHMATCH_OPERATOR_MODE;
  vi.useRealTimers();
});

describe("POST /api/matches/start", () => {
  it("returns 404 when operator mode is disabled", async () => {
    process.env.HASHMATCH_OPERATOR_MODE = "false";
    const response = await POST(createStartRequest());
    expect(response.status).toBe(404);
  });

  it("creates a match directory and writes match_status.json", async () => {
    const request = createStartRequest();

    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { matchId: string };

    expect(payload.matchId).toMatch(/^match-\d{8}-\d{6}-\d{3}-[a-f0-9-]+$/);
    expect(payload.matchId).not.toContain("numberguess");

    const matchDir = join(tempDir, "matches", payload.matchId);
    expect(existsSync(matchDir)).toBe(true);

    const status = readStatus(matchDir);
    expect(["running", "finished"]).toContain(status.status);
    expect(status.scenario).toBe(scenario);
    expect(status.totalTurns).toBe(totalTurns);

    const terminalStatus = await waitForTerminalStatus(matchDir);
    expect(terminalStatus.status).toBe("finished");
    expect(existsSync(join(matchDir, "match_summary.json"))).toBe(true);
    expect(existsSync(join(matchDir, "match_manifest.json"))).toBe(true);
    expect(existsSync(join(matchDir, "match.jsonl"))).toBe(true);
  });

  it("returns 409 when a match directory is already running", async () => {
    const now = new Date("2024-01-02T03:04:05.006Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const matchId = buildOperatorMatchId(now);
    const matchDir = join(tempDir, "matches", matchId);
    mkdirSync(matchDir, { recursive: true });
    writeFileSync(
      join(matchDir, "match_status.json"),
      JSON.stringify({
        matchId,
        status: "running",
        scenario,
        agents,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        verified: null,
        totalTurns,
        currentTurn: null,
      }),
      "utf-8",
    );
    const response = await POST(createStartRequest());
    expect(response.status).toBe(409);
  });

  it("writes terminal status after the match completes", async () => {
    const response = await POST(createStartRequest());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { matchId: string };
    const matchDir = join(tempDir, "matches", payload.matchId);
    const terminalStatus = await waitForTerminalStatus(matchDir);
    expect(terminalStatus.status).toBe("finished");
    expect(terminalStatus.finishedAt).toBeDefined();
    expect(terminalStatus.verified).not.toBeNull();
  });
});
