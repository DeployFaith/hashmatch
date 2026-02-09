import type { Agent, Scenario } from "../contract/interfaces.js";
import type { AgentId, JsonValue, MatchEvent, Seed } from "../contract/types.js";
import { runMatch } from "../engine/runMatch.js";
import { createNumberGuessScenario } from "../scenarios/numberGuess/index.js";
import { createHeistScenario } from "../scenarios/heist/index.js";
import { createResourceRivalsScenario } from "../scenarios/resourceRivals/index.js";
import { createRandomAgent } from "../agents/randomAgent.js";
import { createBaselineAgent } from "../agents/baselineAgent.js";
import { createNoopAgent } from "../agents/noopAgent.js";
import { createRandomBidderAgent } from "../agents/resourceRivals/randomBidder.js";
import { createConservativeAgent } from "../agents/resourceRivals/conservativeAgent.js";
import { buildOllamaHeistMetadata } from "../agents/ollama/index.js";
import { createOllamaAgent } from "../agents/ollama/createOllamaAgent.js";
import type { OllamaConfig } from "../agents/ollama/ollamaClient.js";
import { getScenarioAdapter } from "../agents/llm/adapters.js";
import type {
  MatchKey,
  MatchSpec,
  MatchSummary,
  TournamentConfig,
  TournamentResult,
} from "./types.js";
import { computeStandings } from "./standings.js";

// ---------------------------------------------------------------------------
// Registries (v0.1 — built-in only)
// ---------------------------------------------------------------------------

type ScenarioFactory = () => Scenario<any, any, any>;
type AgentFactory = (id: AgentId) => Agent<any, any>;

export interface AgentProvenanceDescriptor {
  metadata?: Record<string, JsonValue>;
}

interface AgentRegistration {
  factory: AgentFactory;
  provenance?: AgentProvenanceDescriptor | (() => AgentProvenanceDescriptor);
}

interface AgentFactoryOptions {
  scenarioKey?: string;
  slotIndex?: number;
}

const scenarioRegistry: Record<string, ScenarioFactory> = {
  heist: createHeistScenario,
  numberGuess: createNumberGuessScenario,
  resourceRivals: createResourceRivalsScenario,
};

// All five built-in agents are scripted/deterministic (no LLM provider or
// model config). They are explicitly tagged as non-publishable test fixtures
// so the publish pipeline can reject them. Category (B) agents (random,
// baseline, randomBidder, conservative) will be migrated to LLM-backed
// versions once the provider gateway lands — see #125.
const agentRegistry: Record<string, AgentRegistration> = {
  random: {
    factory: createRandomAgent,
    provenance: { metadata: { agentType: "scripted", purpose: "test" } },
  },
  baseline: {
    factory: createBaselineAgent,
    provenance: { metadata: { agentType: "scripted", purpose: "test" } },
  },
  noop: {
    factory: createNoopAgent,
    provenance: { metadata: { agentType: "scripted", purpose: "test" } },
  },
  randomBidder: {
    factory: createRandomBidderAgent,
    provenance: { metadata: { agentType: "scripted", purpose: "test" } },
  },
  conservative: {
    factory: createConservativeAgent,
    provenance: { metadata: { agentType: "scripted", purpose: "test" } },
  },
};

const knownLlmProviders = ["ollama"];
const llmAgentKeys = ["llm:ollama:<model>", "ollama-heist"];
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
let ollamaHeistDeprecatedWarned = false;

function resolveTemperature(): { value: number; options?: Record<string, unknown> } {
  const raw = process.env.OLLAMA_TEMPERATURE;
  if (!raw || raw.trim().length === 0) {
    return { value: 0.3 };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { value: 0.3 };
  }
  return { value: parsed, options: { temperature: parsed } };
}

function resolveOllamaModel(
  keyModel: string | undefined,
  slotIndex?: number,
  allowGlobalOverride = true,
): string {
  if (slotIndex !== undefined) {
    const override = process.env[`OLLAMA_MODEL_${slotIndex}`];
    if (override && override.trim().length > 0) {
      return override.trim();
    }
  }
  if (keyModel && keyModel.trim().length > 0) {
    return keyModel.trim();
  }
  if (allowGlobalOverride) {
    const globalModel = process.env.OLLAMA_MODEL;
    if (globalModel && globalModel.trim().length > 0) {
      return globalModel.trim();
    }
  }
  return DEFAULT_OLLAMA_MODEL;
}

function resolveOllamaConfig(keyModel: string | undefined, slotIndex?: number): OllamaConfig {
  const model = resolveOllamaModel(keyModel, slotIndex);
  const { options } = resolveTemperature();
  const endpoint = process.env.OLLAMA_ENDPOINT?.trim();
  return {
    model,
    ...(endpoint ? { endpoint } : {}),
    ...(options ? { options } : {}),
  };
}

function resolveLlmAgentFactory(
  provider: string,
  model: string,
  scenarioKey: string | undefined,
  slotIndex?: number,
): AgentFactory {
  if (!scenarioKey) {
    throw new Error(
      "llm: agents require --scenario to select behavior. Example: --scenario heist --agentA llm:ollama:qwen2.5:3b. This requires --scenario.",
    );
  }

  if (!knownLlmProviders.includes(provider)) {
    throw new Error(
      `Unknown LLM provider "${provider}". Available providers: ${knownLlmProviders.join(", ")}`,
    );
  }

  const adapter = getScenarioAdapter(scenarioKey);

  if (provider === "ollama") {
    const config = resolveOllamaConfig(model, slotIndex);
    return (id: AgentId) => createOllamaAgent(id, config, adapter);
  }

  throw new Error(`Provider "${provider}" is registered but has no factory. This is a bug.`);
}

function listAvailableAgentKeys(): string {
  return [...Object.keys(agentRegistry), ...llmAgentKeys].join(", ");
}

function parseLlmKey(key: string): { provider: string; model: string } {
  const rest = key.slice(4);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(
      `Invalid LLM agent key "${key}". Use format llm:<provider>:<model> (example: llm:ollama:qwen2.5:3b).`,
    );
  }
  const provider = rest.slice(0, separatorIndex);
  const model = rest.slice(separatorIndex + 1);
  if (!provider || !model) {
    throw new Error(
      `Invalid LLM agent key "${key}". Use format llm:<provider>:<model> (example: llm:ollama:qwen2.5:3b).`,
    );
  }
  return { provider, model };
}

/** Resolve a scenario factory by key. Throws if unknown. */
export function getScenarioFactory(key: string): ScenarioFactory {
  const factory = scenarioRegistry[key];
  if (!factory) {
    const available = Object.keys(scenarioRegistry).join(", ");
    throw new Error(`Unknown scenario "${key}". Available: ${available}`);
  }
  return factory;
}

/** Resolve an agent factory by key. Throws if unknown. */
export function getAgentFactory(key: string, options: AgentFactoryOptions = {}): AgentFactory {
  if (key.startsWith("llm:")) {
    const { provider, model } = parseLlmKey(key);
    return resolveLlmAgentFactory(provider, model, options.scenarioKey, options.slotIndex);
  }

  if (key === "ollama-heist") {
    if (!ollamaHeistDeprecatedWarned) {
      ollamaHeistDeprecatedWarned = true;
      // eslint-disable-next-line no-console
      console.warn('⚠️  Agent key "ollama-heist" is deprecated. Use "llm:ollama" with --scenario.');
    }
    const model = resolveOllamaModel(undefined, options.slotIndex);
    return resolveLlmAgentFactory(
      "ollama",
      model,
      options.scenarioKey ?? "heist",
      options.slotIndex,
    );
  }

  const registration = agentRegistry[key];
  if (!registration) {
    throw new Error(`Unknown agent "${key}". Available: ${listAvailableAgentKeys()}`);
  }
  return registration.factory;
}

export function getAgentProvenanceDescriptor(key: string): AgentProvenanceDescriptor | undefined {
  if (key === "ollama-heist") {
    const model = resolveOllamaModel(undefined);
    return { metadata: buildOllamaHeistMetadata(model) };
  }
  if (key.startsWith("llm:")) {
    const { provider, model } = parseLlmKey(key);
    if (provider === "ollama") {
      return { metadata: buildOllamaHeistMetadata(model) };
    }
  }
  const registration = agentRegistry[key];
  if (!registration?.provenance) {
    return undefined;
  }
  return typeof registration.provenance === "function"
    ? registration.provenance()
    : registration.provenance;
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deterministic seeding
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a hash. */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Derive a deterministic match seed from tournament seed + match key. */
export function deriveMatchSeed(tournamentSeed: Seed, matchKey: MatchKey): Seed {
  const combined = `${tournamentSeed}:${matchKey}`;
  return fnv1a32(combined);
}

// ---------------------------------------------------------------------------
// Tournament runner
// ---------------------------------------------------------------------------

/**
 * Run a complete round-robin tournament.
 *
 * Deterministic: given the same config, produces identical results.
 */
export async function runTournament(config: TournamentConfig): Promise<TournamentResult> {
  const {
    seed,
    maxTurns,
    rounds,
    scenarioKey,
    agentKeys,
    includeEventLogs,
    modeProfile,
    divisionConfig,
    maxTurnTimeMs,
    maxConsecutiveTimeouts,
    harnessVersion,
  } = config;

  // Validate
  const scenarioFactory = getScenarioFactory(scenarioKey);
  const agentFactories = agentKeys.map((key, index) => ({
    key,
    factory: getAgentFactory(key, { scenarioKey, slotIndex: index }),
  }));

  const matches: MatchSummary[] = [];
  const matchSpecs: MatchSpec[] = [];
  const matchLogs: Record<MatchKey, MatchEvent[]> = {};
  const agentIds = agentFactories.map((a, i) => `${a.key}-${i}`);
  const scenarioName = scenarioFactory().name;

  // Round-robin: for every unordered pair (i, j) with i < j, play `rounds` matches
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < agentFactories.length; i++) {
      for (let j = i + 1; j < agentFactories.length; j++) {
        // Stable competitor IDs (index-based, independent of seat order)
        const agentAId = `${agentFactories[i].key}-${i}`;
        const agentBId = `${agentFactories[j].key}-${j}`;
        const matchKey = `RR:${agentAId}-vs-${agentBId}:round${round + 1}`;
        const matchSeed = deriveMatchSeed(seed, matchKey);
        const scenario = scenarioFactory();

        // Fresh agent instances per match (agents can be stateful)
        const agentA = agentFactories[i].factory(agentAId);
        const agentB = agentFactories[j].factory(agentBId);

        // Deterministic seat-order swap to avoid first-move bias:
        // incorporates round and pair indices so order alternates across rounds
        const swap = (round + i + j) % 2 === 1;
        const orderedAgents = swap ? [agentB, agentA] : [agentA, agentB];

        const result = await runMatch(scenario, orderedAgents, {
          seed: matchSeed,
          maxTurns,
          modeProfile,
          divisionConfig,
          maxTurnTimeMs,
          maxConsecutiveTimeouts,
        });

        if (includeEventLogs) {
          matchLogs[matchKey] = result.events;
        }

        // Determine winner (uses stable IDs, independent of seat order)
        const scoreA = result.scores[agentAId] ?? 0;
        const scoreB = result.scores[agentBId] ?? 0;
        let winner: AgentId | null = null;
        if (scoreA > scoreB) {
          winner = agentAId;
        } else if (scoreB > scoreA) {
          winner = agentBId;
        }

        const lastEvent = result.events[result.events.length - 1];
        const reason = lastEvent.type === "MatchEnded" ? lastEvent.reason : "unknown";

        matches.push({
          matchId: result.matchId,
          matchKey,
          seed: matchSeed,
          agentIds: [agentAId, agentBId],
          scores: result.scores,
          timeoutsPerAgent: result.timeoutsPerAgent,
          ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
          winner,
          turns: result.turns,
          reason,
        });

        matchSpecs.push({
          matchKey,
          seed: matchSeed,
          scenarioName,
          agentIds: [agentAId, agentBId],
          maxTurns,
        });
      }
    }
  }

  const standings = computeStandings(agentIds, matches);

  const tournamentResult: TournamentResult = {
    config,
    tournament: {
      tournamentSeed: seed,
      scenarioName,
      agents: agentIds,
      matches: matchSpecs,
      ...(modeProfile !== undefined && { modeProfile }),
      ...(harnessVersion !== undefined && { harnessVersion }),
    },
    matchSummaries: matches,
    standings,
  };
  if (includeEventLogs) {
    tournamentResult.matchLogs = matchLogs;
  }
  return tournamentResult;
}
