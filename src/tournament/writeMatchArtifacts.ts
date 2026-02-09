import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashFile, hashManifestCore } from "../core/hash.js";
import { stableStringify, toStableJsonl } from "../core/json.js";
import type { AgentId, MatchEvent } from "../contract/types.js";
import { detectMoments } from "../lib/replay/detectMoments.js";
import { verifyMatchDirectory } from "../core/verifyMatchDirectory.js";
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
} from "./provenance.js";
import type { MatchManifest, MatchSummary } from "./types.js";

function ensureSingleTrailingNewline(value: string): string {
  return value.replace(/\n*$/, "\n");
}

function buildBroadcastManifestFiles(
  hasMoments: boolean,
  hasHighlights: boolean,
  gatewayTranscriptFilename?: string,
): BroadcastManifestFileEntry[] {
  const files: BroadcastManifestFileEntry[] = [
    { path: "match.jsonl", class: "truth" },
    { path: "match_manifest.json", class: "truth" },
    { path: "match_summary.json", class: "telemetry" },
  ];
  if (gatewayTranscriptFilename) {
    files.push({ path: gatewayTranscriptFilename, class: "telemetry" });
  }
  if (hasMoments) {
    files.push({ path: "moments.json", class: "telemetry" });
  }
  if (hasHighlights) {
    files.push({ path: "highlights.json", class: "show" });
  }
  return files;
}

export interface MatchArtifactsCoreOptions {
  matchDir: string;
  events: MatchEvent[];
  manifest: MatchManifest;
  summary: MatchSummary;
  moments?: {
    enabled?: boolean;
    writeHighlights?: (moments: ReturnType<typeof detectMoments>, summary: MatchSummary) => unknown;
  };
  broadcast?: {
    bundleId: string;
    bundleType: "match";
    modeProfileId: string;
    createdBy: string;
    gatewayTranscriptFilename?: string;
  };
  verification?: {
    enabled?: boolean;
    verifiedAt: string;
  };
}

export interface MatchArtifactsCoreResult {
  logHash: string;
  manifestHash: string;
}

const DEFAULT_MODE_PROFILE_ID = "sandbox";

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

export async function writeMatchArtifactsCore(
  options: MatchArtifactsCoreOptions,
): Promise<MatchArtifactsCoreResult> {
  mkdirSync(options.matchDir, { recursive: true });

  writeFileSync(
    join(options.matchDir, "match_manifest.json"),
    ensureSingleTrailingNewline(stableStringify(options.manifest)),
    "utf-8",
  );

  const matchLogPath = join(options.matchDir, "match.jsonl");
  writeFileSync(matchLogPath, toStableJsonl(options.events), "utf-8");

  const logHash = await hashFile(matchLogPath);
  const manifestHash = hashManifestCore(options.manifest as unknown as Record<string, unknown>);
  const summaryWithHashes: MatchSummary = {
    ...options.summary,
    hashes: {
      logHash,
      manifestHash,
    },
  };

  writeFileSync(
    join(options.matchDir, "match_summary.json"),
    ensureSingleTrailingNewline(stableStringify(summaryWithHashes)),
    "utf-8",
  );

  const momentsEnabled = options.moments?.enabled !== false;
  let hasMoments = false;
  if (momentsEnabled) {
    const moments = detectMoments(options.events);
    if (moments.length > 0) {
      writeFileSync(
        join(options.matchDir, "moments.json"),
        ensureSingleTrailingNewline(stableStringify(moments)),
        "utf-8",
      );
      hasMoments = true;
      const highlightWriter = options.moments?.writeHighlights;
      if (highlightWriter) {
        const highlights = highlightWriter(moments, options.summary);
        if (highlights) {
          writeFileSync(
            join(options.matchDir, "highlights.json"),
            ensureSingleTrailingNewline(stableStringify(highlights)),
            "utf-8",
          );
        }
      }
    }
  }

  if (options.verification?.enabled) {
    const verificationReport = await verifyMatchDirectory(options.matchDir);
    const verificationResult = {
      status: verificationReport.status === "pass" ? "verified" : "failed",
      checks: {
        logHash: verificationReport.logHash?.ok ?? false,
        manifestHash: verificationReport.manifestHash?.ok ?? false,
      },
      verifiedAt: options.verification.verifiedAt,
    };
    writeFileSync(
      join(options.matchDir, "verification_result.json"),
      ensureSingleTrailingNewline(stableStringify(verificationResult)),
      "utf-8",
    );
  }

  if (options.broadcast) {
    const hasHighlights = existsSync(join(options.matchDir, "highlights.json"));
    const gatewayTranscriptFilename = options.broadcast.gatewayTranscriptFilename;
    const hasGatewayTranscript = gatewayTranscriptFilename
      ? existsSync(join(options.matchDir, gatewayTranscriptFilename))
      : false;
    const broadcastFiles = buildBroadcastManifestFiles(
      hasMoments,
      hasHighlights,
      hasGatewayTranscript ? gatewayTranscriptFilename : undefined,
    );
    const truthFileHashes: Record<string, string> = {
      "match.jsonl": logHash,
      "match_manifest.json": manifestHash,
    };
    const broadcastManifest: BroadcastManifest = {
      bundleId: options.broadcast.bundleId,
      bundleType: options.broadcast.bundleType,
      modeProfileId: options.broadcast.modeProfileId,
      createdBy: options.broadcast.createdBy,
      files: sortBroadcastManifestFiles(broadcastFiles),
      truthBundleHash: hashTruthBundle(truthFileHashes),
    };
    writeFileSync(
      join(options.matchDir, "broadcast_manifest.json"),
      ensureSingleTrailingNewline(stableStringify(broadcastManifest)),
      "utf-8",
    );
  }

  return { logHash, manifestHash };
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
  };

  await writeMatchArtifactsCore({
    matchDir: config.matchDir,
    events: config.events,
    manifest,
    summary,
    moments: { enabled: true },
    broadcast: {
      bundleId: config.matchId,
      bundleType: "match",
      modeProfileId: manifest.modeProfileId,
      createdBy: manifest.runner.name,
      gatewayTranscriptFilename: GATEWAY_TRANSCRIPT_FILENAME,
    },
  });
}
