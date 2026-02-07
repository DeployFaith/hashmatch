import type { MatchRunnerConfig } from "../contract/interfaces.js";
import type { AgentId, JsonValue, MatchEvent, MatchResult } from "../contract/types.js";

export interface HeistSoloRun {
  agentId: AgentId;
  result: MatchResult;
}

type MatchEndedReason = "completed" | "maxTurnsReached";

type MatchEndSummary = {
  reason: MatchEndedReason;
  details?: JsonValue;
};

function extractMatchEnd(result: MatchResult): MatchEndSummary {
  const last = result.events[result.events.length - 1];
  if (last?.type !== "MatchEnded") {
    throw new Error("Expected MatchEnded event for heist solo run.");
  }
  return {
    reason: last.reason,
    ...(last.details !== undefined && { details: last.details }),
  };
}

function stripMatchBoundaries(events: MatchEvent[]): MatchEvent[] {
  return events.filter((event) => event.type !== "MatchStarted" && event.type !== "MatchEnded");
}

function buildProvenanceFields(config: MatchRunnerConfig): Record<string, string> {
  if (!config.provenance) {
    return {};
  }
  return {
    ...(config.provenance.engineCommit !== undefined && {
      engineCommit: config.provenance.engineCommit,
    }),
    ...(config.provenance.engineVersion !== undefined && {
      engineVersion: config.provenance.engineVersion,
    }),
  };
}

export function combineHeistRuns(
  scenarioName: string,
  config: MatchRunnerConfig,
  agentIds: AgentId[],
  runs: [HeistSoloRun, HeistSoloRun],
): MatchResult {
  const matchId = config.matchId ?? runs[0].result.matchId;
  const provenanceFields = buildProvenanceFields(config);

  const [runA, runB] = runs;
  const matchEndA = extractMatchEnd(runA.result);
  const matchEndB = extractMatchEnd(runB.result);

  const scores: Record<AgentId, number> = {
    ...runA.result.scores,
    ...runB.result.scores,
  };

  const reason: MatchEndedReason =
    matchEndA.reason === "maxTurnsReached" || matchEndB.reason === "maxTurnsReached"
      ? "maxTurnsReached"
      : "completed";

  const turns = Math.max(runA.result.turns, runB.result.turns);

  const attemptDetails = [
    matchEndA.details !== undefined
      ? {
          agentId: runA.agentId,
          turns: runA.result.turns,
          reason: matchEndA.reason,
          details: matchEndA.details,
        }
      : null,
    matchEndB.details !== undefined
      ? {
          agentId: runB.agentId,
          turns: runB.result.turns,
          reason: matchEndB.reason,
          details: matchEndB.details,
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const details = attemptDetails.length > 0 ? { attempts: attemptDetails } : undefined;

  const startedEvent: MatchEvent = {
    type: "MatchStarted",
    matchId,
    seq: 0,
    seed: config.seed,
    agentIds,
    scenarioName,
    maxTurns: config.maxTurns,
    ...provenanceFields,
  } as MatchEvent;

  const mergedEvents: MatchEvent[] = [
    startedEvent,
    ...stripMatchBoundaries(runA.result.events),
    ...stripMatchBoundaries(runB.result.events),
    {
      type: "MatchEnded",
      matchId,
      seq: 0,
      reason,
      scores,
      turns,
      ...(details !== undefined && { details }),
    } as MatchEvent,
  ];

  const normalizedEvents = mergedEvents.map((event, index) => ({
    ...event,
    matchId,
    seq: index,
  }));

  return {
    matchId,
    seed: config.seed,
    scores,
    events: normalizedEvents,
    turns,
  };
}
