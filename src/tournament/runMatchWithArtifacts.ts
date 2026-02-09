import { runMatch } from "../engine/runMatch.js";
import { runMatchWithGateway } from "../engine/runMatchWithGateway.js";
import type { MatchResult } from "../contract/types.js";
import { createHttpAdapter } from "../gateway/httpAdapter.js";
import { createTranscriptWriter } from "../gateway/transcript.js";
import type { GatewayRuntimeConfig } from "../gateway/runtime.js";
import { writeMatchArtifacts } from "./writeMatchArtifacts.js";
import { getAgentFactory, getScenarioFactory } from "./runTournament.js";

export interface RunMatchArtifactsOptions {
  scenarioKey: string;
  agentKeys: string[];
  seed: number;
  maxTurns: number;
  matchId?: string;
  outDir?: string;
  gateway?: "local" | "http";
  agentUrls?: string[];
  transcriptDir?: string;
  provenance?: { engineCommit?: string; engineVersion?: string };
  modeKey?: string;
}

export interface RunMatchArtifactsOutcome {
  result: MatchResult;
  scenarioName: string;
  reason: string;
}

export async function runMatchWithArtifacts(
  options: RunMatchArtifactsOptions,
): Promise<RunMatchArtifactsOutcome> {
  const scenarioFactory = getScenarioFactory(options.scenarioKey);
  const agentFactories = options.agentKeys.map((key, index) => ({
    key,
    factory: getAgentFactory(key, { scenarioKey: options.scenarioKey, slotIndex: index }),
  }));

  const scenario = scenarioFactory();
  const agents = agentFactories.map((agentConfig, index) => {
    if (!agentConfig) {
      throw new Error(`Missing agent factory for "${options.agentKeys[index]}"`);
    }
    return agentConfig.factory(`${agentConfig.key}-${index}`);
  });

  const matchConfig = {
    seed: options.seed,
    maxTurns: options.maxTurns,
    ...(options.provenance ? { provenance: options.provenance } : {}),
    ...(options.matchId ? { matchId: options.matchId } : {}),
  };
  if (options.gateway === "http") {
    if (!options.agentUrls || options.agentUrls.length !== options.agentKeys.length) {
      throw new Error("agentUrls must be provided for each agent when gateway http is enabled");
    }
    if (options.agentUrls.some((url) => url.trim().length === 0)) {
      throw new Error("agentUrls must be non-empty when gateway http is enabled");
    }
  }
  const agentUrls = options.agentUrls ?? [];
  let result: MatchResult;
  if (options.gateway) {
    const gatewayDefaults = {
      defaultDeadlineMs: 5000,
      maxResponseBytes: 1024 * 1024,
    };
    const gatewayConfig: GatewayRuntimeConfig = {
      mode: options.gateway,
      config: gatewayDefaults,
      transcriptWriter: createTranscriptWriter(options.transcriptDir ?? options.outDir ?? process.cwd()),
      gameId: scenario.name,
      gameVersion: "unknown",
      ...(options.gateway === "http"
        ? {
            adapters: new Map(
              agents.map((agent, index) => [
                agent.id,
                createHttpAdapter(agentUrls[index], gatewayDefaults),
              ]),
            ),
          }
        : {}),
    };

    result = await runMatchWithGateway(scenario, agents, matchConfig, gatewayConfig);
  } else {
    result = await runMatch(scenario, agents, matchConfig);
  }

  const lastEvent = result.events[result.events.length - 1];
  const reason = lastEvent?.type === "MatchEnded" ? lastEvent.reason : "unknown";

  if (options.outDir) {
    await writeMatchArtifacts({
      matchId: result.matchId,
      scenarioName: scenario.name,
      scenarioKey: options.scenarioKey,
      scenarioHints: scenario.getScenarioHints(),
      agentKeys: options.agentKeys,
      seed: options.seed,
      maxTurns: options.maxTurns,
      maxTurnTimeMs: result.maxTurnTimeMs,
      events: result.events,
      scores: result.scores,
      timeoutsPerAgent: result.timeoutsPerAgent,
      ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
      turns: result.turns,
      reason,
      matchDir: options.outDir,
      ...(options.modeKey ? { modeKey: options.modeKey } : {}),
    });
  }

  return { result, scenarioName: scenario.name, reason };
}
