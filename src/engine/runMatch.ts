import type { Agent, AgentContext, MatchRunnerConfig, Scenario } from "../contract/interfaces.js";
import type { AgentId, JsonValue, MatchEvent, MatchResult } from "../contract/types.js";
import { createRng, deriveSeed } from "../core/rng.js";
import { combineHeistRuns } from "./heistCompetitive.js";
import { generateMatchId } from "./matchId.js";

/** Append a partial event (sans seq/matchId) to the event list. */
function emit(
  events: MatchEvent[],
  seq: { value: number },
  matchId: string,
  partial: Record<string, unknown> & { type: string },
): void {
  events.push({ ...partial, seq: seq.value++, matchId } as MatchEvent);
}

/**
 * Run a complete match: initialize scenario + agents, loop turns, collect
 * events, and return the final result.
 *
 * Pure computation — no I/O. The caller decides what to do with the events.
 */
function runMatchStandard<TState, TObs, TAct>(
  scenario: Scenario<TState, TObs, TAct>,
  agents: Agent<TObs, TAct>[],
  config: MatchRunnerConfig,
): MatchResult {
  const events: MatchEvent[] = [];
  const seq = { value: 0 };

  const masterRng = createRng(config.seed);
  const generatedMatchId = generateMatchId(masterRng);
  const matchId = config.matchId ?? generatedMatchId;

  // Stable agent ordering
  const agentIds: AgentId[] = agents.map((a) => a.id);

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
        action = agent.act(observation, ctx);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        emit(events, seq, matchId, { type: "AgentError", agentId: agent.id, turn, message });
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
    }

    emit(events, seq, matchId, {
      type: "StateUpdated",
      turn,
      summary: scenario.summarize(state),
    });
  }

  const scores = scenario.score(state);
  const reason = scenario.isTerminal(state) ? "completed" : "maxTurnsReached";

  const details = scenario.reveal?.(state);
  emit(events, seq, matchId, {
    type: "MatchEnded",
    reason,
    scores,
    turns: turn,
    ...(details !== undefined && { details }),
  });

  return { matchId, seed: config.seed, scores, events, turns: turn };
}

export function runMatch<TState, TObs, TAct>(
  scenario: Scenario<TState, TObs, TAct>,
  agents: Agent<TObs, TAct>[],
  config: MatchRunnerConfig,
): MatchResult {
  const isHeistCompetitive = scenario.name === "Heist" && agents.length === 2;
  if (!isHeistCompetitive) {
    return runMatchStandard(scenario, agents, config);
  }

  const [agentA, agentB] = agents;
  const resultA = runMatchStandard(scenario, [agentA], config);
  const matchId = config.matchId ?? resultA.matchId;
  const resultB = runMatchStandard(scenario, [agentB], { ...config, matchId });

  return combineHeistRuns(scenario.name, { ...config, matchId }, [agentA.id, agentB.id], [
    { agentId: agentA.id, result: resultA },
    { agentId: agentB.id, result: resultB },
  ]);
}
