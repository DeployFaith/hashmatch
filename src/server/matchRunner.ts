import { existsSync, mkdirSync } from "node:fs";
import { createUniqueMatchId, isSafeMatchId } from "../engine/matchId.js";
import { runMatch } from "../engine/runMatch.js";
import { getAgentFactory, getScenarioFactory } from "../tournament/runTournament.js";
import { writeMatchArtifacts } from "./matchArtifacts.js";
import {
  ensureMatchStorageRoot,
  getMatchDirectory,
  writeMatchStatus,
  type MatchStatusState,
} from "./matchStorage.js";

const DEFAULT_TURNS = 20;

export interface StartMatchRequest {
  scenarioKey: string;
  agentKeys: string[];
  seed?: number;
  turns?: number;
  modeKey?: string;
}

export interface StartMatchResult {
  matchId: string;
  matchPath: string;
  runPromise: Promise<void>;
}

function resolveSeed(seed?: number): number {
  if (typeof seed === "number" && Number.isInteger(seed) && seed >= 0) {
    return seed;
  }
  return Math.floor(Math.random() * 2 ** 32);
}

function resolveTurns(turns?: number): number {
  if (typeof turns === "number" && Number.isInteger(turns) && turns > 0) {
    return turns;
  }
  return DEFAULT_TURNS;
}

function writeTerminalStatus(
  matchDir: string,
  status: MatchStatusState,
  startedAt: string,
  error?: string,
): void {
  writeMatchStatus(matchDir, {
    status,
    startedAt,
    endedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  });
}

async function runMatchAndPersist(
  request: StartMatchRequest,
  matchId: string,
  matchDir: string,
  seed: number,
  maxTurns: number,
  startedAt: string,
): Promise<void> {
  try {
    const scenarioFactory = getScenarioFactory(request.scenarioKey);
    const scenario = scenarioFactory();
    const agentFactories = request.agentKeys.map((key) => getAgentFactory(key));
    const agents = agentFactories.map((factory, index) =>
      factory(`${request.agentKeys[index]}-${index}`),
    );

    const result = await runMatch(scenario, agents, {
      seed,
      maxTurns,
      matchId,
    });

    const lastEvent = result.events[result.events.length - 1];
    const reason = lastEvent?.type === "MatchEnded" ? lastEvent.reason : "unknown";

    await writeMatchArtifacts({
      matchId,
      scenarioName: scenario.name,
      scenarioKey: request.scenarioKey,
      agentKeys: request.agentKeys,
      seed,
      maxTurns,
      maxTurnTimeMs: result.maxTurnTimeMs,
      modeKey: request.modeKey,
      events: result.events,
      scores: result.scores,
      timeoutsPerAgent: result.timeoutsPerAgent,
      ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
      turns: result.turns,
      reason,
      matchDir,
    });

    const finalStatus: MatchStatusState = reason === "completed" ? "complete" : "incomplete";
    writeTerminalStatus(matchDir, finalStatus, startedAt);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    writeTerminalStatus(matchDir, "failed", startedAt, message);
  }
}

export async function startMatchRun(request: StartMatchRequest): Promise<StartMatchResult> {
  ensureMatchStorageRoot();
  const seed = resolveSeed(request.seed);
  const maxTurns = resolveTurns(request.turns);
  const matchId = createUniqueMatchId();

  if (!isSafeMatchId(matchId)) {
    throw new Error(`Generated unsafe matchId "${matchId}"`);
  }

  const matchDir = getMatchDirectory(matchId);
  if (existsSync(matchDir)) {
    throw new Error(`Match directory already exists: ${matchDir}`);
  }
  mkdirSync(matchDir, { recursive: true });

  const startedAt = new Date().toISOString();
  writeMatchStatus(matchDir, { status: "running", startedAt });

  const runPromise = new Promise<void>((resolve, reject) => {
    setImmediate(() => {
      runMatchAndPersist(request, matchId, matchDir, seed, maxTurns, startedAt)
        .then(resolve)
        .catch(reject);
    });
  });

  return { matchId, matchPath: `/match/${matchId}`, runPromise };
}
