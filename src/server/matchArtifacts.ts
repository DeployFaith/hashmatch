import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashFile, hashManifestCore } from "../core/hash.js";
import { stableStringify, toStableJsonl } from "../core/json.js";
import type { AgentId, MatchEvent } from "../contract/types.js";
import { detectMoments } from "../lib/replay/detectMoments.js";
import {
  buildMatchManifestProvenanceFromConfig,
  type MatchManifestProvenanceConfig,
} from "../tournament/provenance.js";
import type { MatchManifest, MatchSummary } from "../tournament/types.js";

const DEFAULT_MODE_PROFILE_ID = "sandbox";

function ensureSingleTrailingNewline(value: string): string {
  return value.replace(/\n*$/, "\n");
}

function resolveModeProfileId(modeKey: string | undefined): string {
  if (modeKey && modeKey.trim().length > 0) {
    return modeKey;
  }
  return DEFAULT_MODE_PROFILE_ID;
}

function determineWinner(scores: Record<AgentId, number>, agentIds: AgentId[]): AgentId | null {
  let winner: AgentId | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let hasTie = false;

  for (const agentId of agentIds) {
    const score = scores[agentId] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      winner = agentId;
      hasTie = false;
    } else if (score === bestScore) {
      hasTie = true;
    }
  }

  return hasTie ? null : winner;
}

export interface MatchArtifactsConfig {
  matchId: string;
  scenarioName: string;
  scenarioKey: string;
  agentKeys: string[];
  seed: number;
  maxTurns: number;
  modeKey?: string;
  events: MatchEvent[];
  scores: Record<AgentId, number>;
  turns: number;
  reason: string;
  matchDir: string;
}

export async function writeMatchArtifacts(config: MatchArtifactsConfig): Promise<void> {
  mkdirSync(config.matchDir, { recursive: true });

  const provenanceConfig: MatchManifestProvenanceConfig = {
    scenarioKey: config.scenarioKey,
    scenarioName: config.scenarioName,
    agentKeys: config.agentKeys,
  };
  const provenance = await buildMatchManifestProvenanceFromConfig(provenanceConfig);
  const agentIds = config.agentKeys.map((key, index) => `${key}-${index}`);

  const manifest: MatchManifest = {
    matchId: config.matchId,
    modeProfileId: resolveModeProfileId(config.modeKey),
    scenario: provenance.scenario,
    agents: agentIds.map((id) => {
      const agent = provenance.agentsById.get(id);
      if (!agent) {
        throw new Error(`Missing provenance for agent "${id}"`);
      }
      return agent;
    }),
    config: {
      maxTurns: config.maxTurns,
      seed: config.seed,
      seedDerivationInputs: {
        tournamentSeed: config.seed,
        matchKey: config.matchId,
      },
    },
    runner: {
      name: "local-runner",
      version: null,
      gitCommit: null,
    },
    createdAt: new Date().toISOString(),
  };

  writeFileSync(
    join(config.matchDir, "match_manifest.json"),
    ensureSingleTrailingNewline(stableStringify(manifest)),
    "utf-8",
  );

  const matchLogPath = join(config.matchDir, "match.jsonl");
  writeFileSync(matchLogPath, toStableJsonl(config.events), "utf-8");

  const logHash = await hashFile(matchLogPath);
  const manifestHash = hashManifestCore(manifest as unknown as Record<string, unknown>);
  const summary: MatchSummary = {
    matchId: config.matchId,
    matchKey: config.matchId,
    seed: config.seed,
    agentIds,
    scores: config.scores,
    winner: determineWinner(config.scores, agentIds),
    turns: config.turns,
    reason: config.reason,
    hashes: {
      logHash,
      manifestHash,
    },
  };

  writeFileSync(
    join(config.matchDir, "match_summary.json"),
    ensureSingleTrailingNewline(stableStringify(summary)),
    "utf-8",
  );

  const moments = detectMoments(config.events);
  if (moments.length > 0) {
    writeFileSync(
      join(config.matchDir, "moments.json"),
      ensureSingleTrailingNewline(stableStringify(moments)),
      "utf-8",
    );
  }
}
