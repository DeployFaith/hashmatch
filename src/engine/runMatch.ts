import type { Agent, AgentContext, MatchRunnerConfig, Scenario } from "../contract/interfaces.js";
import type { AgentId, JsonValue, MatchEvent, MatchResult } from "../contract/types.js";
import { createRng, deriveSeed } from "../core/rng.js";
import { combineHeistRuns } from "./heistCompetitive.js";
import { generateMatchId } from "./matchId.js";
import { resolveMaxConsecutiveTimeouts, resolveMaxTurnTimeMs } from "./turnTimeout.js";

/** Append a partial event (sans seq/matchId) to the event list. */
function emit(
  events: MatchEvent[],
  seq: { value: number },
  matchId: string,
  partial: Record<string, unknown> & { type: string },
): void {
  events.push({ ...partial, seq: seq.value++, matchId } as MatchEvent);
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: boolean; value?: T }> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { timedOut: false, value: await promise };
  }
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  const wrappedPromise = promise.then(
    (value) => ({ timedOut: false as const, value }),
    (error) => ({ timedOut: false as const, error }),
  );
  try {
    const result = await Promise.race([wrappedPromise, timeoutPromise]);
    if ("error" in result) {
      throw result.error;
    }
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function applyForfeitScores(
  scores: Record<AgentId, number>,
  forfeitedBy: AgentId | undefined,
): Record<AgentId, number> {
  if (!forfeitedBy) {
    return scores;
  }
  const forfeitingScore = scores[forfeitedBy] ?? 0;
  const updated = { ...scores };
  for (const [agentId, score] of Object.entries(scores)) {
    if (agentId === forfeitedBy) {
      continue;
    }
    if (score <= forfeitingScore) {
      updated[agentId] = forfeitingScore + 1;
    }
  }
  return updated;
}

/**
 * Run a complete match: initialize scenario + agents, loop turns, collect
 * events, and return the final result.
 *
 * Pure computation — no I/O. The caller decides what to do with the events.
 */
async function runMatchStandard<TState, TObs, TAct>(
  scenario: Scenario<TState, TObs, TAct>,
  agents: Agent<TObs, TAct>[],
  config: MatchRunnerConfig,
): Promise<MatchResult> {
  const events: MatchEvent[] = [];
  const seq = { value: 0 };

  const masterRng = createRng(config.seed);
  const generatedMatchId = generateMatchId(masterRng);
  const matchId = config.matchId ?? generatedMatchId;

  // Stable agent ordering
  const agentIds: AgentId[] = agents.map((a) => a.id);
  const maxTurnTimeMs = resolveMaxTurnTimeMs(config);
  const maxConsecutiveTimeouts = resolveMaxConsecutiveTimeouts(config);
  const timeoutsPerAgent: Record<AgentId, number> = Object.fromEntries(
    agentIds.map((agentId) => [agentId, 0]),
  );
  const consecutiveTimeouts = new Map<AgentId, number>(
    agentIds.map((agentId) => [agentId, 0]),
  );
  let forfeitedBy: AgentId | undefined;

  // Give each agent its own independent RNG stream
  const agentRngs = new Map<AgentId, () => number>();
  for (const agent of agents) {
    const agentSeed = deriveSeed(masterRng);
    agentRngs.set(agent.id, createRng(agentSeed));
    agent.init({ agentId: agent.id, seed: agentSeed });
  }

  // Initialize scenario with its own derived seed
  const scenarioSeed = deriveSeed(masterRng);
  let state = scenario.init(scenarioSeed, agentIds);

  const provenanceFields = config.provenance
    ? {
        ...(config.provenance.engineCommit !== undefined && {
          engineCommit: config.provenance.engineCommit,
        }),
        ...(config.provenance.engineVersion !== undefined && {
          engineVersion: config.provenance.engineVersion,
        }),
      }
    : {};

  emit(events, seq, matchId, {
    type: "MatchStarted",
    seed: config.seed,
    agentIds,
    scenarioName: scenario.name,
    maxTurns: config.maxTurns,
    ...provenanceFields,
  });

  let turn = 0;

  while (turn < config.maxTurns && !scenario.isTerminal(state)) {
    turn++;
    emit(events, seq, matchId, { type: "TurnStarted", turn });

    for (const agent of agents) {
      if (scenario.isTerminal(state)) {
        break;
      }

      const observation = scenario.observe(state, agent.id);
      emit(events, seq, matchId, {
        type: "ObservationEmitted",
        agentId: agent.id,
        turn,
        observation: observation as JsonValue,
      });

      let action: TAct;
      try {
        const ctx: AgentContext = {
          rng: agentRngs.get(agent.id)!,
          turn,
          agentId: agent.id,
        };
        const result = await raceWithTimeout(
          Promise.resolve().then(() => agent.act(observation, ctx)),
          maxTurnTimeMs,
        );
        if (result.timedOut) {
          timeoutsPerAgent[agent.id] = (timeoutsPerAgent[agent.id] ?? 0) + 1;
          const nextConsecutive = (consecutiveTimeouts.get(agent.id) ?? 0) + 1;
          consecutiveTimeouts.set(agent.id, nextConsecutive);
          emit(events, seq, matchId, {
            type: "AgentError",
            agentId: agent.id,
            turn,
            message: `Agent exceeded maxTurnTimeMs (${maxTurnTimeMs}ms). Default action applied.`,
            errorType: "timeout",
          });
          action = scenario.getDefaultAction();
          if (nextConsecutive >= maxConsecutiveTimeouts) {
            forfeitedBy = agent.id;
          }
        } else {
          consecutiveTimeouts.set(agent.id, 0);
          action = result.value as TAct;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        emit(events, seq, matchId, { type: "AgentError", agentId: agent.id, turn, message });
        consecutiveTimeouts.set(agent.id, 0);
        continue;
      }

      emit(events, seq, matchId, {
        type: "ActionSubmitted",
        agentId: agent.id,
        turn,
        action: action as JsonValue,
      });

      const result = scenario.adjudicate(state, agent.id, action);
      emit(events, seq, matchId, {
        type: "ActionAdjudicated",
        agentId: agent.id,
        turn,
        valid: result.valid,
        feedback: result.feedback,
      });

      state = result.state;

      if (forfeitedBy) {
        break;
      }
    }

    emit(events, seq, matchId, {
      type: "StateUpdated",
      turn,
      summary: scenario.summarize(state),
    });

    if (forfeitedBy) {
      break;
    }
  }

  const baseScores = scenario.score(state);
  const scores = applyForfeitScores(baseScores, forfeitedBy);
  const reason = forfeitedBy
    ? "agentForfeited"
    : scenario.isTerminal(state)
      ? "completed"
      : "maxTurnsReached";

  const details = scenario.reveal?.(state);
  emit(events, seq, matchId, {
    type: "MatchEnded",
    reason,
    scores,
    turns: turn,
    ...(details !== undefined && { details }),
  });

  return {
    matchId,
    seed: config.seed,
    scores,
    events,
    turns: turn,
    maxTurnTimeMs,
    timeoutsPerAgent,
    ...(forfeitedBy ? { forfeitedBy } : {}),
  };
}

export async function runMatch<TState, TObs, TAct>(
  scenario: Scenario<TState, TObs, TAct>,
  agents: Agent<TObs, TAct>[],
  config: MatchRunnerConfig,
): Promise<MatchResult> {
  const isHeistCompetitive = scenario.name === "Heist" && agents.length === 2;
  if (!isHeistCompetitive) {
    return runMatchStandard(scenario, agents, config);
  }

  const [agentA, agentB] = agents;
  const resultA = await runMatchStandard(scenario, [agentA], config);
  const matchId = config.matchId ?? resultA.matchId;
  const resultB = await runMatchStandard(scenario, [agentB], { ...config, matchId });

  return combineHeistRuns(scenario.name, { ...config, matchId }, [agentA.id, agentB.id], [
    { agentId: agentA.id, result: resultA },
    { agentId: agentB.id, result: resultB },
  ]);
}
