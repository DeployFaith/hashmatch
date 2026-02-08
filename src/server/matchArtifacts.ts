import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashFile, hashManifestCore } from "../core/hash.js";
import { stableStringify, toStableJsonl } from "../core/json.js";
import type { AgentId, MatchEvent } from "../contract/types.js";
import { detectMoments } from "../lib/replay/detectMoments.js";
import {
  hashTruthBundle,
  sortBroadcastManifestFiles,
  type BroadcastManifest,
  type BroadcastManifestFileEntry,
} from "../core/broadcastManifest.js";
import { GATEWAY_TRANSCRIPT_FILENAME } from "../gateway/transcript.js";
import {
  buildMatchManifestProvenanceFromConfig,
  type MatchManifestProvenanceConfig,
} from "../tournament/provenance.js";
import type { MatchManifest, MatchSummary } from "../tournament/types.js";

const DEFAULT_MODE_PROFILE_ID = "sandbox";

function ensureSingleTrailingNewline(value: string): string {
  return value.replace(/\n*$/, "\n");
}

function buildBroadcastManifestFiles(
  hasMoments: boolean,
  hasHighlights: boolean,
  hasGatewayTranscript: boolean,
): BroadcastManifestFileEntry[] {
  const files: BroadcastManifestFileEntry[] = [
    { path: "match.jsonl", class: "truth" },
    { path: "match_manifest.json", class: "truth" },
    { path: "match_summary.json", class: "telemetry" },
  ];
  if (hasGatewayTranscript) {
    files.push({ path: GATEWAY_TRANSCRIPT_FILENAME, class: "telemetry" });
  }
  if (hasMoments) {
    files.push({ path: "moments.json", class: "telemetry" });
  }
  if (hasHighlights) {
    files.push({ path: "highlights.json", class: "show" });
  }
  return files;
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
  maxTurnTimeMs: number;
  modeKey?: string;
  events: MatchEvent[];
  scores: Record<AgentId, number>;
  timeoutsPerAgent: Record<AgentId, number>;
  forfeitedBy?: AgentId;
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
      maxTurnTimeMs: config.maxTurnTimeMs,
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
    timeoutsPerAgent: config.timeoutsPerAgent,
    ...(config.forfeitedBy ? { forfeitedBy: config.forfeitedBy } : {}),
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
  let hasMoments = false;
  if (moments.length > 0) {
    writeFileSync(
      join(config.matchDir, "moments.json"),
      ensureSingleTrailingNewline(stableStringify(moments)),
      "utf-8",
    );
    hasMoments = true;
  }

  const hasHighlights = existsSync(join(config.matchDir, "highlights.json"));
  const hasGatewayTranscript = existsSync(join(config.matchDir, GATEWAY_TRANSCRIPT_FILENAME));
  const broadcastFiles = buildBroadcastManifestFiles(
    hasMoments,
    hasHighlights,
    hasGatewayTranscript,
  );
  const truthFileHashes: Record<string, string> = {
    "match.jsonl": logHash,
    "match_manifest.json": manifestHash,
  };
  const broadcastManifest: BroadcastManifest = {
    bundleId: config.matchId,
    bundleType: "match",
    modeProfileId: manifest.modeProfileId,
    createdBy: manifest.runner.name,
    files: sortBroadcastManifestFiles(broadcastFiles),
    truthBundleHash: hashTruthBundle(truthFileHashes),
  };
  writeFileSync(
    join(config.matchDir, "broadcast_manifest.json"),
    ensureSingleTrailingNewline(stableStringify(broadcastManifest)),
    "utf-8",
  );
}
