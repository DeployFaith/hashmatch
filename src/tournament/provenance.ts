import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentId } from "../contract/types.js";
import { computeArtifactContentHash } from "../core/hash.js";
import type { MatchManifestAgent, MatchManifestScenario, TournamentResult } from "./types.js";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HASH_EXCLUDE_EXTENSIONS = [".d.ts", ".map"];

const SCENARIO_PATHS: Record<string, string> = {
  numberGuess: "scenarios/numberGuess",
  resourceRivals: "scenarios/resourceRivals",
};

const AGENT_PATHS: Record<string, string> = {
  random: "agents/randomAgent",
  baseline: "agents/baselineAgent",
  randomBidder: "agents/resourceRivals/randomBidder",
  conservative: "agents/resourceRivals/conservativeAgent",
};

function resolveDirectoryPath(relativePath: string): string {
  const fullPath = join(RUNTIME_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing artifact directory: ${fullPath}`);
  }
  const stats = statSync(fullPath);
  if (!stats.isDirectory()) {
    throw new Error(`Expected directory for artifact hashing: ${fullPath}`);
  }
  return relativePath;
}

function resolveFilePath(relativePath: string): string {
  const directPath = join(RUNTIME_ROOT, relativePath);
  if (existsSync(directPath) && statSync(directPath).isFile()) {
    return relativePath;
  }
  const extensions = [".ts", ".js"];
  for (const ext of extensions) {
    const candidate = `${relativePath}${ext}`;
    const candidatePath = join(RUNTIME_ROOT, candidate);
    if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Missing artifact file: ${directPath}`);
}

function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(REPO_ROOT, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version.trim()) {
      return parsed.version;
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

export async function buildMatchManifestProvenance(
  result: TournamentResult,
): Promise<MatchManifestProvenance> {
  const scenarioPath = SCENARIO_PATHS[result.config.scenarioKey];
  if (!scenarioPath) {
    throw new Error(`Missing scenario provenance mapping for "${result.config.scenarioKey}"`);
  }
  const scenarioContentHash = await computeArtifactContentHash({
    rootDir: RUNTIME_ROOT,
    includePaths: [resolveDirectoryPath(scenarioPath)],
    excludeExtensions: HASH_EXCLUDE_EXTENSIONS,
  });

  const artifactVersion = readPackageVersion();

  const scenario: MatchManifestScenario = {
    id: result.tournament.scenarioName,
    version: artifactVersion,
    contractVersion: null,
    contentHash: scenarioContentHash,
  };

  const agentContentHashes = new Map<string, string>();
  for (const agentKey of result.config.agentKeys) {
    if (agentContentHashes.has(agentKey)) {
      continue;
    }
    const agentPath = AGENT_PATHS[agentKey];
    if (!agentPath) {
      throw new Error(`Missing agent provenance mapping for "${agentKey}"`);
    }
    const contentHash = await computeArtifactContentHash({
      rootDir: RUNTIME_ROOT,
      includePaths: [resolveFilePath(agentPath)],
      excludeExtensions: HASH_EXCLUDE_EXTENSIONS,
    });
    agentContentHashes.set(agentKey, contentHash);
  }

  const agentsById = new Map<AgentId, MatchManifestAgent>();
  result.config.agentKeys.forEach((agentKey, index) => {
    const agentId = `${agentKey}-${index}`;
    const contentHash = agentContentHashes.get(agentKey);
    if (!contentHash) {
      throw new Error(`Missing agent hash for "${agentKey}"`);
    }
    agentsById.set(agentId, {
      id: agentId,
      version: artifactVersion,
      contentHash,
    });
  });

  return { scenario, agentsById };
}
