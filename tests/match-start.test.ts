import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/matches/start/route.js";
import { buildOperatorMatchId } from "../src/server/operatorMatch.js";

let tempDir = "";
const scenario = "numberGuess";
const agents = ["random", "baseline"];

function createStartRequest() {
  return new Request("http://localhost/api/matches/start", {
    method: "POST",
    body: JSON.stringify({
      scenario,
      agents,
      seed: 123,
    }),
  });
}

function readStatus(matchDir: string): { status: string; finishedAt?: string } {
  const statusPath = join(matchDir, "match_status.json");
  const statusRaw = readFileSync(statusPath, "utf-8");
  return JSON.parse(statusRaw) as { status: string; finishedAt?: string };
}

async function waitForTerminalStatus(matchDir: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = readStatus(matchDir);
    if (status.status !== "running") {
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
  process.env.MATCH_STORAGE_DIR = tempDir;
  process.env.HASHMATCH_OPERATOR_MODE = "true";
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  delete process.env.MATCH_STORAGE_DIR;
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

    expect(payload.matchId).toMatch(/^match-\d{8}-\d{6}-\d{3}-numberguess$/);

    const matchDir = join(tempDir, payload.matchId);
    expect(existsSync(matchDir)).toBe(true);

    const status = readStatus(matchDir);
    expect(["running", "completed", "crashed"]).toContain(status.status);

    const terminalStatus = await waitForTerminalStatus(matchDir);
    expect(["completed", "crashed"]).toContain(terminalStatus.status);
    expect(existsSync(join(matchDir, "match_summary.json"))).toBe(true);
    expect(existsSync(join(matchDir, "match_manifest.json"))).toBe(true);
    expect(existsSync(join(matchDir, "match.jsonl"))).toBe(true);
  });

  it("returns 409 when a match directory is already running", async () => {
    const now = new Date("2024-01-02T03:04:05.006Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const matchId = buildOperatorMatchId(now, scenario);
    const matchDir = join(tempDir, matchId);
    mkdirSync(matchDir, { recursive: true });
    writeFileSync(
      join(matchDir, "match_status.json"),
      JSON.stringify({
        matchId,
        status: "running",
        scenario,
        agents,
        seed: 123,
        startedAt: new Date().toISOString(),
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
    const matchDir = join(tempDir, payload.matchId);
    const terminalStatus = await waitForTerminalStatus(matchDir);
    expect(["completed", "crashed"]).toContain(terminalStatus.status);
    expect(terminalStatus.finishedAt).toBeDefined();
  });
});
