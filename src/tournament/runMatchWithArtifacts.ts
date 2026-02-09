import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMatch } from "../engine/runMatch.js";
import { runMatchWithGateway } from "../engine/runMatchWithGateway.js";
import type { MatchEndedEvent, MatchResult, MatchSetupFailedEvent } from "../contract/types.js";
import { createHttpAdapter } from "../gateway/httpAdapter.js";
import { createTranscriptWriter } from "../gateway/transcript.js";
import type { GatewayRuntimeConfig } from "../gateway/runtime.js";
import { writeMatchArtifacts, writeMatchArtifactsCore } from "./writeMatchArtifacts.js";
import { getAgentFactory, getScenarioFactory } from "./runTournament.js";
import { LlmPreflightError, preflightValidateLlmAgents } from "../agents/llm/preflight.js";
import { parseLlmAgentKey } from "../agents/llm/keys.js";
import { createMatchIdFromSeed } from "../engine/matchId.js";
import { stableStringify } from "../core/json.js";
import { buildMatchManifestProvenanceFromConfig } from "./provenance.js";
import { resolveMaxTurnTimeMs } from "../engine/turnTimeout.js";
import type { MatchManifest, MatchSummary } from "./types.js";

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
  const llmAgents = options.agentKeys.flatMap((key) => {
    if (key.startsWith("llm:")) {
      return [parseLlmAgentKey(key)];
    }
    if (key === "ollama-heist") {
      return [
        {
          kind: "llm" as const,
          provider: "ollama" as const,
          model: process.env.OLLAMA_MODEL?.trim() || "qwen2.5:3b",
          purpose: "competitive" as const,
        },
      ];
    }
    return [];
  });
  if (llmAgents.length > 0) {
    try {
      await preflightValidateLlmAgents(llmAgents);
    } catch (err: unknown) {
      if (options.outDir) {
        await writePreflightFailureArtifacts(
          options.outDir,
          options.matchId,
          options,
          err,
        );
      }
      throw err;
    }
  }
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
      transcriptWriter: createTranscriptWriter(
        options.transcriptDir ?? options.outDir ?? process.cwd(),
      ),
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

// ---------------------------------------------------------------------------
// Preflight failure artifact writer
// ---------------------------------------------------------------------------

function resolveModeProfileId(modeKey: string | undefined): string {
  if (modeKey && modeKey.trim().length > 0) {
    return modeKey;
  }
  return "sandbox";
}

async function writePreflightFailureArtifacts(
  outDir: string,
  matchIdOverride: string | undefined,
  options: RunMatchArtifactsOptions,
  err: unknown,
): Promise<void> {
  const matchId = matchIdOverride ?? createMatchIdFromSeed(options.seed);
  const now = new Date().toISOString();
  const safeMessage = err instanceof Error ? err.message : String(err);
  const safeDetails = err instanceof LlmPreflightError ? err.details : undefined;

  const setupFailedEvent: MatchSetupFailedEvent = {
    type: "MatchSetupFailed",
    seq: 0,
    matchId,
    message: safeMessage,
    ...(safeDetails ? { details: safeDetails } : {}),
  };

  const matchEndedEvent: MatchEndedEvent = {
    type: "MatchEnded",
    seq: 1,
    matchId,
    reason: "setupFailed",
    scores: {},
    turns: 0,
  };

  const scenarioName = getScenarioFactory(options.scenarioKey)().name;
  const provenance = await buildMatchManifestProvenanceFromConfig({
    scenarioKey: options.scenarioKey,
    scenarioName,
    agentKeys: options.agentKeys,
  });
  const agentIds = options.agentKeys.map((key, index) => `${key}-${index}`);
  const maxTurnTimeMs = resolveMaxTurnTimeMs({
    seed: options.seed,
    maxTurns: options.maxTurns,
  });

  const manifest: MatchManifest = {
    matchId,
    modeProfileId: resolveModeProfileId(options.modeKey),
    scenario: provenance.scenario,
    agents: agentIds.map((id) => {
      const agent = provenance.agentsById.get(id);
      if (!agent) {
        throw new Error(`Missing provenance for agent "${id}"`);
      }
      return agent;
    }),
    config: {
      maxTurns: options.maxTurns,
      maxTurnTimeMs,
      seed: options.seed,
      seedDerivationInputs: {
        tournamentSeed: options.seed,
        matchKey: matchId,
      },
    },
    runner: {
      name: "local-runner",
      version: null,
      gitCommit: null,
    },
    createdAt: new Date().toISOString(),
  };

  const scores = Object.fromEntries(agentIds.map((agentId) => [agentId, 0]));
  const timeoutsPerAgent = Object.fromEntries(agentIds.map((agentId) => [agentId, 0]));
  const summary: MatchSummary = {
    matchId,
    matchKey: matchId,
    seed: options.seed,
    agentIds,
    scores,
    timeoutsPerAgent,
    winner: null,
    turns: 0,
    reason: "setupFailed",
    error: safeMessage,
  };

  mkdirSync(outDir, { recursive: true });

  await writeMatchArtifactsCore({
    matchDir: outDir,
    events: [setupFailedEvent, matchEndedEvent],
    manifest,
    summary,
    moments: { enabled: false },
  });

  writeFileSync(
    join(outDir, "match_status.json"),
    stableStringify({
      matchId,
      status: "failed",
      startedAt: now,
      endedAt: now,
      error: safeMessage,
    }) + "\n",
    "utf-8",
  );
}
