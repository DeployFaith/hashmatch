import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashManifestCore, sha256Hex } from "../core/hash.js";
import { stableStringify, toStableJsonl } from "../core/json.js";
import type { MatchEvent } from "../contract/types.js";
import type { TournamentBundleV1 } from "../lib/replay/bundle.js";
import { detectMoments } from "../lib/replay/detectMoments.js";
import { generateHighlights } from "../lib/replay/generateHighlights.js";
import type { JsonValue } from "../contract/types.js";
import { buildMatchManifestProvenance } from "./provenance.js";
import type { MatchKey, MatchManifest, TournamentManifest, TournamentResult } from "./types.js";
import { resolveMaxTurnTimeMs } from "../engine/turnTimeout.js";
import {
  hashTruthBundle,
  sortBroadcastManifestFiles,
  type BroadcastManifest,
  type BroadcastManifestFileEntry,
} from "../core/broadcastManifest.js";
import { writeMatchArtifactsCore } from "./writeMatchArtifacts.js";
import { getScenarioFactory } from "./runTournament.js";

function resolveModeProfileId(modeProfile: JsonValue | undefined): string {
  if (typeof modeProfile === "string") {
    return modeProfile;
  }
  if (modeProfile && typeof modeProfile === "object" && !Array.isArray(modeProfile)) {
    const record = modeProfile as Record<string, JsonValue>;
    if (typeof record.id === "string") {
      return record.id;
    }
    if (typeof record.name === "string") {
      return record.name;
    }
  }
  return "sandbox";
}

function buildMatchManifest(
  result: TournamentResult,
  matchKey: MatchKey,
  matchId: string,
  seed: number,
  agentIds: string[],
  maxTurnTimeMs: number,
  provenance: {
    scenario: MatchManifest["scenario"];
    agentsById: Map<string, MatchManifest["agents"][number]>;
  },
): MatchManifest {
  const modeProfileId = resolveModeProfileId(result.tournament.modeProfile);
  const harnessVersion = result.tournament.harnessVersion ?? null;
  const scenario = provenance.scenario;
  const agents = agentIds.map((id) => {
    const agent = provenance.agentsById.get(id);
    if (!agent) {
      throw new Error(`Missing provenance for agent "${id}"`);
    }
    return agent;
  });

  return {
    matchId,
    modeProfileId,
    scenario,
    agents,
    config: {
      maxTurns: result.config.maxTurns,
      maxTurnTimeMs,
      seed,
      seedDerivationInputs: {
        tournamentSeed: result.tournament.tournamentSeed,
        matchKey,
      },
    },
    runner: {
      name: "tournament-harness",
      version: harnessVersion,
      gitCommit: null,
    },
  };
}

function buildTournamentManifest(result: TournamentResult): TournamentManifest {
  return {
    tournamentSeed: result.tournament.tournamentSeed,
    scenarioName: result.tournament.scenarioName,
    agents: result.tournament.agents,
    matches: result.tournament.matches,
    ...(result.tournament.modeProfile !== undefined && {
      modeProfile: result.tournament.modeProfile,
    }),
    ...(result.tournament.harnessVersion !== undefined && {
      harnessVersion: result.tournament.harnessVersion,
    }),
  };
}

function assertMatchLogs(
  matchKey: MatchKey,
  matchLogs: TournamentResult["matchLogs"],
): asserts matchLogs is Record<MatchKey, MatchEvent[]> {
  if (!matchLogs || !matchLogs[matchKey]) {
    throw new Error(`Missing event log for matchKey "${matchKey}"`);
  }
}

function ensureSingleTrailingNewline(value: string): string {
  return value.replace(/\n*$/, "\n");
}

function buildTournamentBroadcastManifestFiles(
  matchKeys: MatchKey[],
  hasMoments: Set<MatchKey>,
  hasHighlights: Set<MatchKey>,
): BroadcastManifestFileEntry[] {
  const files: BroadcastManifestFileEntry[] = [
    { path: "tournament_manifest.json", class: "truth" },
    { path: "tournament.json", class: "truth" },
    { path: "standings.json", class: "telemetry" },
  ];

  for (const matchKey of matchKeys) {
    files.push({ path: `matches/${matchKey}/match.jsonl`, class: "truth" });
    files.push({ path: `matches/${matchKey}/match_manifest.json`, class: "truth" });
    files.push({ path: `matches/${matchKey}/match_summary.json`, class: "telemetry" });
    files.push({ path: `matches/${matchKey}/verification_result.json`, class: "telemetry" });
    if (hasMoments.has(matchKey)) {
      files.push({ path: `matches/${matchKey}/moments.json`, class: "telemetry" });
    }
    if (hasHighlights.has(matchKey)) {
      files.push({ path: `matches/${matchKey}/highlights.json`, class: "show" });
    }
  }

  return files;
}

export async function writeTournamentArtifacts(
  result: TournamentResult,
  outDir: string,
): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  const provenance = await buildMatchManifestProvenance(result);
  const scenario = getScenarioFactory(result.config.scenarioKey)();
  const scenarioHints = scenario.getScenarioHints();
  const effectiveMaxTurnTimeMs = resolveMaxTurnTimeMs({
    seed: result.config.seed,
    maxTurns: result.config.maxTurns,
    modeProfile: result.config.modeProfile,
    divisionConfig: result.config.divisionConfig,
    maxTurnTimeMs: result.config.maxTurnTimeMs,
    maxConsecutiveTimeouts: result.config.maxConsecutiveTimeouts,
  });
  const tournamentManifest = buildTournamentManifest(result);
  const tournamentManifestJson = ensureSingleTrailingNewline(stableStringify(tournamentManifest));
  writeFileSync(join(outDir, "tournament_manifest.json"), tournamentManifestJson, "utf-8");
  writeFileSync(join(outDir, "tournament.json"), tournamentManifestJson, "utf-8");
  writeFileSync(join(outDir, "standings.json"), stableStringify(result.standings) + "\n", "utf-8");

  const matchesDir = join(outDir, "matches");
  mkdirSync(matchesDir, { recursive: true });
  const logHashes: string[] = [];
  const truthFileHashes: Record<string, string> = {};

  for (const summary of result.matchSummaries) {
    const matchDir = join(matchesDir, summary.matchKey);
    mkdirSync(matchDir, { recursive: true });

    const manifest = buildMatchManifest(
      result,
      summary.matchKey,
      summary.matchId,
      summary.seed,
      summary.agentIds,
      effectiveMaxTurnTimeMs,
      provenance,
    );

    assertMatchLogs(summary.matchKey, result.matchLogs);
    const events = result.matchLogs[summary.matchKey];
    const { logHash, manifestHash } = await writeMatchArtifactsCore({
      matchDir,
      events,
      manifest,
      summary,
      scenarioHints,
      moments: {
        enabled: true,
        writeHighlights: (moments, matchSummary) => generateHighlights(moments, matchSummary),
      },
      verification: {
        enabled: true,
        verifiedAt: new Date(summary.seed).toISOString(),
      },
    });
    logHashes.push(logHash);
    truthFileHashes[`matches/${summary.matchKey}/match.jsonl`] = logHash;
    truthFileHashes[`matches/${summary.matchKey}/match_manifest.json`] = manifestHash;
  }

  const truthBundleHash = sha256Hex(Buffer.from(logHashes.sort().join(""), "utf-8"));
  const manifestPath = join(outDir, "tournament_manifest.json");
  const existingManifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as TournamentManifest;
  const updatedManifest: TournamentManifest = {
    ...existingManifest,
    truthBundleHash,
  };
  const updatedManifestJson = ensureSingleTrailingNewline(stableStringify(updatedManifest));
  writeFileSync(manifestPath, updatedManifestJson, "utf-8");
  writeFileSync(join(outDir, "tournament.json"), updatedManifestJson, "utf-8");

  const tournamentManifestHash = hashManifestCore(
    updatedManifest as unknown as Record<string, unknown>,
  );
  truthFileHashes["tournament_manifest.json"] = tournamentManifestHash;
  truthFileHashes["tournament.json"] = tournamentManifestHash;

  const matchKeys = result.matchSummaries.map((summary) => summary.matchKey);
  const detectedMoments = new Set(
    matchKeys.filter((matchKey) => existsSync(join(outDir, "matches", matchKey, "moments.json"))),
  );
  const detectedHighlights = new Set(
    matchKeys.filter((matchKey) =>
      existsSync(join(outDir, "matches", matchKey, "highlights.json")),
    ),
  );
  const broadcastFiles = buildTournamentBroadcastManifestFiles(
    matchKeys,
    detectedMoments,
    detectedHighlights,
  );
  const broadcastManifest: BroadcastManifest = {
    bundleId: String(result.tournament.tournamentSeed),
    bundleType: "tournament",
    modeProfileId: resolveModeProfileId(result.tournament.modeProfile),
    createdBy: "tournament-harness",
    files: sortBroadcastManifestFiles(broadcastFiles),
    truthBundleHash: hashTruthBundle(truthFileHashes),
  };
  writeFileSync(
    join(outDir, "broadcast_manifest.json"),
    ensureSingleTrailingNewline(stableStringify(broadcastManifest)),
    "utf-8",
  );
}

export async function buildTournamentBundle(result: TournamentResult): Promise<TournamentBundleV1> {
  const summaryLookup = new Map(
    result.matchSummaries.map((summary) => [summary.matchKey, summary]),
  );
  const provenance = await buildMatchManifestProvenance(result);
  const effectiveMaxTurnTimeMs = resolveMaxTurnTimeMs({
    seed: result.config.seed,
    maxTurns: result.config.maxTurns,
    modeProfile: result.config.modeProfile,
    divisionConfig: result.config.divisionConfig,
    maxTurnTimeMs: result.config.maxTurnTimeMs,
    maxConsecutiveTimeouts: result.config.maxConsecutiveTimeouts,
  });

  const matches = result.tournament.matches.map((spec) => {
    assertMatchLogs(spec.matchKey, result.matchLogs);
    const events = result.matchLogs[spec.matchKey];
    const summary = summaryLookup.get(spec.matchKey);
    const moments = summary ? detectMoments(events) : [];
    const highlights = summary ? generateHighlights(moments, summary) : null;
    const manifest = summary
      ? buildMatchManifest(
          result,
          spec.matchKey,
          summary.matchId,
          summary.seed,
          summary.agentIds,
          effectiveMaxTurnTimeMs,
          provenance,
        )
      : undefined;
    return {
      matchKey: spec.matchKey,
      ...(summary ? { summary } : {}),
      ...(manifest ? { manifest } : {}),
      ...(highlights ? { highlights } : {}),
      jsonl: toStableJsonl(events),
    };
  });

  return {
    version: 1,
    tournament: result.tournament,
    standings: result.standings,
    matches,
  };
}

export async function writeTournamentBundle(
  result: TournamentResult,
  outPath: string,
): Promise<void> {
  const bundle = await buildTournamentBundle(result);
  writeFileSync(outPath, stableStringify(bundle) + "\n", "utf-8");
}
