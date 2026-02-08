import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { verifyMatchDirectory } from "@/cli/verify-match";
import { buildOperatorMatchId } from "@/server/operatorMatch";
import {
  ensureMatchesRoot,
  readMatchStatus,
  resolveMatchDir,
  writeMatchStatusAtomic,
  type MatchLifecycleStatusRecord,
} from "@/server/matchLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEED = 42;
const DEFAULT_TURNS = 20;

interface StartMatchPayload {
  scenario: string;
  agents: string[];
  seed?: number;
  totalTurns?: number;
  turns?: number;
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
  const totalTurns = record.totalTurns ?? record.turns;

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
  if (
    totalTurns !== undefined &&
    !(typeof totalTurns === "number" && Number.isInteger(totalTurns) && totalTurns > 0)
  ) {
    return { ok: false, error: "totalTurns must be a positive integer" };
  }

  return {
    ok: true,
    data: {
      scenario: scenario.trim(),
      agents: agents.map((agent) => agent.trim()),
      ...(seed !== undefined ? { seed } : {}),
      ...(totalTurns !== undefined ? { totalTurns: totalTurns as number } : {}),
    },
  };
}

function resolveSeed(seed: StartMatchPayload["seed"]): number {
  return isValidSeed(seed) ? seed : DEFAULT_SEED;
}

function resolveTotalTurns(totalTurns: StartMatchPayload["totalTurns"]): number {
  if (typeof totalTurns === "number" && Number.isInteger(totalTurns) && totalTurns > 0) {
    return totalTurns;
  }
  return DEFAULT_TURNS;
}

function createRunnerArgs(
  matchId: string,
  payload: StartMatchPayload,
  outDir: string,
  seed: number,
  totalTurns: number,
): string[] {
  return [
    join(process.cwd(), "dist", "cli", "run-match.js"),
    "--scenario",
    payload.scenario,
    "--seed",
    String(seed),
    "--turns",
    String(totalTurns),
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
  const matchDir = resolveMatchDir(matchId);

  ensureMatchesRoot();
  if (existsSync(matchDir)) {
    return NextResponse.json({ error: "Match directory already exists" }, { status: 409 });
  }

  mkdirSync(matchDir, { recursive: true });

  const totalTurns = resolveTotalTurns(parsed.data.totalTurns);
  const seed = resolveSeed(parsed.data.seed);
  const baseStatus: MatchLifecycleStatusRecord = {
    matchId,
    status: "waiting",
    scenario: parsed.data.scenario,
    agents: parsed.data.agents,
    startedAt: null,
    finishedAt: null,
    verified: null,
    totalTurns,
    currentTurn: null,
  };
  await writeMatchStatusAtomic(matchDir, baseStatus);

  const startedAt = now.toISOString();
  const runningStatus: MatchLifecycleStatusRecord = {
    ...baseStatus,
    status: "running",
    startedAt,
  };
  await writeMatchStatusAtomic(matchDir, runningStatus);

  const runnerArgs = createRunnerArgs(matchId, parsed.data, matchDir, seed, totalTurns);
  const child = spawn(process.execPath, runnerArgs, {
    detached: false,
    stdio: "ignore",
  });

  const finalizeStatus = async () => {
    const latestStatus = (await readMatchStatus(matchDir)) ?? runningStatus;
    const finishedAt = new Date().toISOString();
    const report = await verifyMatchDirectory(matchDir);
    const verified = report.status === "pass";
    const finalStatus: MatchLifecycleStatusRecord = {
      ...latestStatus,
      status: "finished",
      finishedAt,
      verified,
    };
    await writeMatchStatusAtomic(matchDir, finalStatus);
  };

  child.on("exit", (_code) => {
    void finalizeStatus();
  });
  child.on("error", () => {
    void finalizeStatus();
  });

  return NextResponse.json({ matchId });
}
