import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentId, JsonValue } from "../contract/types.js";
import { computeArtifactContentHash, hashFile, sha256Hex } from "../core/hash.js";
import { stableStringify } from "../core/json.js";
import { DEFAULT_RANGE_MAX, DEFAULT_RANGE_MIN } from "../scenarios/numberGuess/index.js";
import {
  DEFAULT_MAX_OBJECTIVES,
  DEFAULT_MAX_OBJECTIVE_VALUE,
  DEFAULT_MIN_OBJECTIVES,
  DEFAULT_MIN_OBJECTIVE_VALUE,
  DEFAULT_STARTING_RESOURCES,
} from "../scenarios/resourceRivals/index.js";
import { DEFAULT_HEIST_PARAMS } from "../scenarios/heist/index.js";
import type { MatchManifestAgent, MatchManifestScenario, TournamentResult } from "./types.js";
import { getAgentProvenanceDescriptor } from "./runTournament.js";

const RUNTIME_ROOT = join(process.cwd(), "src");
const HASH_EXCLUDE_EXTENSIONS = [".d.ts", ".map"];

const SCENARIO_PARAMS_BY_KEY: Record<string, JsonValue> = {
  numberGuess: {
    rangeMin: DEFAULT_RANGE_MIN,
    rangeMax: DEFAULT_RANGE_MAX,
  },
  resourceRivals: {
    startingResources: DEFAULT_STARTING_RESOURCES,
    minObjectives: DEFAULT_MIN_OBJECTIVES,
    maxObjectives: DEFAULT_MAX_OBJECTIVES,
    minObjectiveValue: DEFAULT_MIN_OBJECTIVE_VALUE,
    maxObjectiveValue: DEFAULT_MAX_OBJECTIVE_VALUE,
  },
  heist: DEFAULT_HEIST_PARAMS as unknown as JsonValue,
};

const AGENT_PATHS: Record<string, string> = {
  random: "agents/randomAgent",
  baseline: "agents/baselineAgent",
  noop: "agents/noopAgent",
  randomBidder: "agents/resourceRivals/randomBidder",
  conservative: "agents/resourceRivals/conservativeAgent",
  "ollama-heist": "agents/ollama",
};

const BUILTIN_AGENT_FILES: Record<string, string> = {
  random: "agents/randomAgent.ts",
  baseline: "agents/baselineAgent.ts",
  noop: "agents/noopAgent.ts",
  randomBidder: "agents/resourceRivals/randomBidder.ts",
  conservative: "agents/resourceRivals/conservativeAgent.ts",
};

function resolveArtifactPath(relativePath: string): string {
  const directPath = join(RUNTIME_ROOT, relativePath);
  if (existsSync(directPath)) {
    const stats = statSync(directPath);
    if (stats.isDirectory() || stats.isFile()) {
      return relativePath;
    }
  }
  const extensions = [".ts", ".js"];
  for (const ext of extensions) {
    const candidate = `${relativePath}${ext}`;
    const candidatePath = join(RUNTIME_ROOT, candidate);
    if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Missing artifact path: ${directPath}`);
}

function resolveVersionFromMetadata(metadata?: Record<string, JsonValue>): string {
  if (metadata && typeof metadata.version === "string" && metadata.version.trim().length > 0) {
    return metadata.version;
  }
  return "unversioned";
}

function resolveScenarioParams(scenarioKey: string): JsonValue {
  const params = SCENARIO_PARAMS_BY_KEY[scenarioKey];
  if (!params) {
    throw new Error(`Missing scenario params mapping for "${scenarioKey}"`);
  }
  return params;
}

function resolveScenarioVersionFromFile(path: string): string {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as { gameVersion?: unknown };
    if (typeof parsed.gameVersion === "string" && parsed.gameVersion.trim().length > 0) {
      return parsed.gameVersion;
    }
  } catch {
    // ignore errors
  }
  return "unversioned";
}

export interface MatchManifestProvenance {
  scenario: MatchManifestScenario;
  agentsById: Map<AgentId, MatchManifestAgent>;
}

export interface MatchManifestProvenanceConfig {
  scenarioKey: string;
  scenarioName: string;
  scenarioPath?: string;
  agentKeys: string[];
}

export async function buildMatchManifestProvenanceFromConfig(
  config: MatchManifestProvenanceConfig,
): Promise<MatchManifestProvenance> {
  let scenarioContentHash: string;
  let scenarioVersion: string;
  if (config.scenarioPath) {
    scenarioContentHash = await hashFile(config.scenarioPath);
    scenarioVersion = resolveScenarioVersionFromFile(config.scenarioPath);
  } else {
    const params = resolveScenarioParams(config.scenarioKey);
    scenarioContentHash = sha256Hex(Buffer.from(stableStringify(params), "utf-8"));
    scenarioVersion = "unversioned";
  }

  const scenario: MatchManifestScenario = {
    id: config.scenarioName,
    version: scenarioVersion,
    contractVersion: null,
    contentHash: scenarioContentHash,
  };

  const agentContentHashes = new Map<string, string>();
  for (const agentKey of config.agentKeys) {
    if (agentContentHashes.has(agentKey)) {
      continue;
    }
    const agentPath = resolveAgentPath(agentKey);
    if (!agentPath) {
      throw new Error(`Missing agent provenance mapping for "${agentKey}"`);
    }
    let contentHash: string;
    const builtInAgentFile = BUILTIN_AGENT_FILES[agentKey];
    if (builtInAgentFile) {
      // Built-in agents are hashed from their single source file (no artifact bundle exists).
      contentHash = await hashFile(join(RUNTIME_ROOT, builtInAgentFile));
    } else {
      contentHash = await computeArtifactContentHash({
        rootDir: RUNTIME_ROOT,
        includePaths: [resolveArtifactPath(agentPath)],
        excludeExtensions: HASH_EXCLUDE_EXTENSIONS,
      });
    }
    agentContentHashes.set(agentKey, contentHash);
  }

  const agentMetadataByKey = new Map<string, MatchManifestAgent["metadata"]>();
  const agentVersionByKey = new Map<string, string>();
  for (const agentKey of config.agentKeys) {
    if (agentMetadataByKey.has(agentKey)) {
      continue;
    }
    const descriptor = getAgentProvenanceDescriptor(agentKey);
    if (descriptor?.metadata) {
      agentMetadataByKey.set(agentKey, descriptor.metadata);
      agentVersionByKey.set(agentKey, resolveVersionFromMetadata(descriptor.metadata));
    } else {
      agentVersionByKey.set(agentKey, "unversioned");
    }
  }

  const agentsById = new Map<AgentId, MatchManifestAgent>();
  config.agentKeys.forEach((agentKey, index) => {
    const agentId = `${agentKey}-${index}`;
    const contentHash = agentContentHashes.get(agentKey);
    if (!contentHash) {
      throw new Error(`Missing agent hash for "${agentKey}"`);
    }
    const metadata = agentMetadataByKey.get(agentKey);
    const version = agentVersionByKey.get(agentKey) ?? "unversioned";
    agentsById.set(agentId, {
      id: agentId,
      version,
      contentHash,
      ...(metadata ? { metadata } : {}),
    });
  });

  return { scenario, agentsById };
}

function resolveAgentPath(agentKey: string): string | undefined {
  if (agentKey.startsWith("llm:ollama:")) {
    return "agents/ollama";
  }
  return AGENT_PATHS[agentKey];
}

export async function buildMatchManifestProvenance(
  result: TournamentResult,
): Promise<MatchManifestProvenance> {
  return buildMatchManifestProvenanceFromConfig({
    scenarioKey: result.config.scenarioKey,
    scenarioName: result.tournament.scenarioName,
    agentKeys: result.config.agentKeys,
  });
}
