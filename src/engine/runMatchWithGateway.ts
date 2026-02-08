import type { Agent, AgentContext, MatchRunnerConfig, Scenario } from "../contract/interfaces.js";
import type {
  AgentId,
  JsonValue,
  MatchEvent,
  MatchResult,
  NormalizationMethod,
} from "../contract/types.js";
import { getActionForensics } from "../core/agentActionMetadata.js";
import { createRng, deriveSeed } from "../core/rng.js";
import { createLocalAdapter } from "../gateway/localAdapter.js";
import type { GatewayObservationRequest } from "../gateway/types.js";
import type { GatewayRuntimeConfig } from "../gateway/runtime.js";
import { combineHeistRuns } from "./heistCompetitive.js";
import { generateMatchId } from "./matchId.js";
import { resolveMaxConsecutiveTimeouts, resolveMaxTurnTimeMs } from "./turnTimeout.js";

function emit(
  events: MatchEvent[],
  seq: { value: number },
  matchId: string,
  partial: Record<string, unknown> & { type: string },
): void {
  events.push({ ...partial, seq: seq.value++, matchId } as MatchEvent);
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

function resolveGameId(scenario: Scenario<unknown, unknown, unknown>, gateway: GatewayRuntimeConfig): string {
  return gateway.gameId ?? scenario.name;
}

function resolveGameVersion(gateway: GatewayRuntimeConfig): string {
  return gateway.gameVersion ?? "unknown";
}

function buildObservationRequest<TObs>(
  gateway: GatewayRuntimeConfig,
  matchId: string,
  turn: number,
  turnStartedAt: string,
  agentId: AgentId,
  observation: TObs,
  deadlineMs: number,
  scenario: Scenario<unknown, unknown, unknown>,
): GatewayObservationRequest {
  return {
    protocolVersion: "0.1.0",
    matchId,
    turn,
    agentId,
    deadlineMs,
    turnStartedAt,
    gameId: resolveGameId(scenario, gateway),
    gameVersion: resolveGameVersion(gateway),
    observation,
    constraints: {
      maxResponseBytes: gateway.config.maxResponseBytes,
    },
  };
}

function scopeGatewayForAgent(
  gateway: GatewayRuntimeConfig,
  agentId: AgentId,
): GatewayRuntimeConfig {
  if (gateway.mode !== "http" || !gateway.adapters) {
    return gateway;
  }
  const adapter = gateway.adapters.get(agentId);
  if (!adapter) {
    throw new Error(`Missing gateway adapter for agent \"${agentId}\"`);
  }
  return { ...gateway, adapters: new Map([[agentId, adapter]]) };
}

async function runMatchWithGatewayStandard<TState, TObs, TAct>(
  scenario: Scenario<TState, TObs, TAct>,
  agents: Agent<TObs, TAct>[],
  config: MatchRunnerConfig,
  gateway: GatewayRuntimeConfig,
): Promise<MatchResult> {
  const events: MatchEvent[] = [];
  const seq = { value: 0 };

  const masterRng = createRng(config.seed);
  const generatedMatchId = generateMatchId(masterRng);
  const matchId = config.matchId ?? generatedMatchId;

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

  const agentRngs = new Map<AgentId, () => number>();
  for (const agent of agents) {
    const agentSeed = deriveSeed(masterRng);
    agentRngs.set(agent.id, createRng(agentSeed));
    agent.init({ agentId: agent.id, seed: agentSeed });
  }

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

  if (gateway.adapters) {
    for (const [agentId, adapter] of gateway.adapters) {
      adapter.onMatchStart?.(matchId, resolveGameId(scenario, gateway), agentId);
    }
  }

  let turn = 0;

  while (turn < config.maxTurns && !scenario.isTerminal(state)) {
    turn++;
    const turnStartedAt = new Date().toISOString();
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

      const ctx: AgentContext = {
        rng: agentRngs.get(agent.id)!,
        turn,
        agentId: agent.id,
      };

      const request = buildObservationRequest(
        gateway,
        matchId,
        turn,
        turnStartedAt,
        agent.id,
        observation,
        maxTurnTimeMs,
        scenario,
      );

      const fallbackAction = scenario.getDefaultAction();
      const adapter =
        gateway.mode === "local"
          ? createLocalAdapter((obs) => agent.act(obs as TObs, ctx), gateway.config)
          : gateway.adapters?.get(agent.id);

      if (!adapter) {
        throw new Error(`Missing gateway adapter for agent "${agent.id}"`);
      }

      let action: TAct;
      let transcript;
      try {
        const result = await adapter.requestAction(request, fallbackAction);
        action = result.action as TAct;
        transcript = result.transcript;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        emit(events, seq, matchId, { type: "AgentError", agentId: agent.id, turn, message });
        continue;
      }

      gateway.transcriptWriter?.write(transcript);

      if (transcript.status === "timeout") {
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
        if (nextConsecutive >= maxConsecutiveTimeouts) {
          forfeitedBy = agent.id;
        }
      } else if (transcript.status !== "ok") {
        emit(events, seq, matchId, {
          type: "AgentError",
          agentId: agent.id,
          turn,
          message: transcript.errorMessage ?? `Gateway ${transcript.status}`,
        });
        consecutiveTimeouts.set(agent.id, 0);
        continue;
      } else {
        consecutiveTimeouts.set(agent.id, 0);
      }

      const actionForensics = getActionForensics(action);
      const chosenAction = (actionForensics?.chosenAction ?? action) as TAct;

      if (actionForensics) {
        emit(events, seq, matchId, {
          type: "AgentRawOutput",
          agentId: agent.id,
          turn,
          rawSha256: actionForensics.rawSha256,
          rawBytes: actionForensics.rawBytes,
          truncated: actionForensics.truncated,
          _privateRaw: actionForensics.rawText,
        });
      }

      emit(events, seq, matchId, {
        type: "ActionSubmitted",
        agentId: agent.id,
        turn,
        action: chosenAction as JsonValue,
      });

      const result = scenario.adjudicate(state, agent.id, chosenAction);
      emit(events, seq, matchId, {
        type: "ActionAdjudicated",
        agentId: agent.id,
        turn,
        valid: result.valid,
        feedback: result.feedback,
        method: (actionForensics?.method ?? "direct-json") as NormalizationMethod,
        warnings: actionForensics?.warnings ?? [],
        errors: actionForensics?.errors ?? null,
        fallbackReason: actionForensics?.fallbackReason ?? null,
        chosenAction: chosenAction as JsonValue,
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

  if (gateway.adapters) {
    for (const adapter of gateway.adapters.values()) {
      adapter.onMatchEnd?.(matchId);
    }
  }

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

export async function runMatchWithGateway<TState, TObs, TAct>(
  scenario: Scenario<TState, TObs, TAct>,
  agents: Agent<TObs, TAct>[],
  config: MatchRunnerConfig,
  gateway: GatewayRuntimeConfig,
): Promise<MatchResult> {
  const isHeistCompetitive = scenario.name === "Heist" && agents.length === 2;
  if (!isHeistCompetitive) {
    return runMatchWithGatewayStandard(scenario, agents, config, gateway);
  }

  const [agentA, agentB] = agents;
  const resultA = await runMatchWithGatewayStandard(
    scenario,
    [agentA],
    config,
    scopeGatewayForAgent(gateway, agentA.id),
  );
  const matchId = config.matchId ?? resultA.matchId;
  const resultB = await runMatchWithGatewayStandard(
    scenario,
    [agentB],
    { ...config, matchId },
    scopeGatewayForAgent(gateway, agentB.id),
  );

  return combineHeistRuns(scenario.name, { ...config, matchId }, [agentA.id, agentB.id], [
    { agentId: agentA.id, result: resultA },
    { agentId: agentB.id, result: resultB },
  ]);
}
