import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { getMatchStorageRoot } from "@/server/matchStorage";
import {
  buildOperatorMatchId,
  readOperatorMatchStatus,
  writeOperatorMatchStatus,
  type OperatorMatchStatus,
} from "@/server/operatorMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEED = 42;
const DEFAULT_TURNS = 20;

interface StartMatchPayload {
  scenario: string;
  agents: string[];
  seed?: number;
}

function isValidSeed(seed: unknown): seed is number {
  return typeof seed === "number" && Number.isInteger(seed) && seed >= 0;
}

function parsePayload(
  payload: unknown,
): { ok: true; data: StartMatchPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid request body" };
  }
  const record = payload as Record<string, unknown>;
  const scenario = record.scenario;
  const agents = record.agents;
  const seed = record.seed;

  if (typeof scenario !== "string" || scenario.trim().length === 0) {
    return { ok: false, error: "Scenario is required" };
  }
  if (!Array.isArray(agents) || agents.length < 2) {
    return { ok: false, error: "Agents must include at least two entries" };
  }
  if (!agents.every((agent) => typeof agent === "string" && agent.trim().length > 0)) {
    return { ok: false, error: "Agents must be strings" };
  }
  if (seed !== undefined && !isValidSeed(seed)) {
    return { ok: false, error: "Seed must be a non-negative integer" };
  }

  return {
    ok: true,
    data: {
      scenario: scenario.trim(),
      agents: agents.map((agent) => agent.trim()),
      ...(seed !== undefined ? { seed } : {}),
    },
  };
}

function resolveSeed(seed: StartMatchPayload["seed"]): number {
  return isValidSeed(seed) ? seed : DEFAULT_SEED;
}

function createRunnerArgs(
  matchId: string,
  payload: StartMatchPayload,
  outDir: string,
  seed: number,
): string[] {
  return [
    join(process.cwd(), "dist", "cli", "run-match.js"),
    "--scenario",
    payload.scenario,
    "--seed",
    String(seed),
    "--turns",
    String(DEFAULT_TURNS),
    "--outDir",
    outDir,
    "--matchId",
    matchId,
    "--agents",
    payload.agents.join(","),
  ];
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.HASHMATCH_OPERATOR_MODE !== "true") {
    return new Response("Not Found", { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parsePayload(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date();
  const matchId = buildOperatorMatchId(now, parsed.data.scenario);
  const outDir = join(getMatchStorageRoot(), matchId);
  const statusPath = join(outDir, "match_status.json");

  if (existsSync(outDir)) {
    const existingStatus = readOperatorMatchStatus(statusPath);
    if (existingStatus?.status === "running") {
      return NextResponse.json({ error: "Match is already running" }, { status: 409 });
    }
  }

  mkdirSync(outDir, { recursive: true });

  const startedAt = now.toISOString();
  const seed = resolveSeed(parsed.data.seed);
  const statusPayload: OperatorMatchStatus = {
    matchId,
    status: "running",
    scenario: parsed.data.scenario,
    agents: parsed.data.agents,
    startedAt,
    seed,
  };
  writeOperatorMatchStatus(statusPath, statusPayload);

  const runnerArgs = createRunnerArgs(matchId, parsed.data, outDir, seed);
  const child = spawn(process.execPath, runnerArgs, {
    detached: false,
    stdio: "ignore",
  });

  const finalizeStatus = (exitCode: number | null, error?: string) => {
    const latestStatus = readOperatorMatchStatus(statusPath) ?? statusPayload;
    const finishedAt = new Date().toISOString();
    writeOperatorMatchStatus(statusPath, {
      ...latestStatus,
      status: exitCode === 0 ? "completed" : "crashed",
      finishedAt,
      ...(typeof exitCode === "number" ? { exitCode } : {}),
      ...(error ? { error } : {}),
    });
  };

  child.on("exit", (code) => finalizeStatus(code));
  child.on("error", (error) => finalizeStatus(null, error.message));

  return NextResponse.json({ matchId, status: "started" });
}
