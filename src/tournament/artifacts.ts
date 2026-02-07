import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashFile, hashManifestCore, sha256Hex } from "../core/hash.js";
import { stableStringify, toStableJsonl } from "../core/json.js";
import type { MatchEvent } from "../contract/types.js";
import type { TournamentBundleV1 } from "../lib/replay/bundle.js";
import { detectMoments } from "../lib/replay/detectMoments.js";
import { generateHighlights } from "../lib/replay/generateHighlights.js";
import type { JsonValue } from "../contract/types.js";
import { buildMatchManifestProvenance } from "./provenance.js";
import type { MatchKey, MatchManifest, TournamentManifest, TournamentResult } from "./types.js";

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
    createdAt: new Date().toISOString(),
  };
}

function buildTournamentManifest(result: TournamentResult): TournamentManifest {
  return {
    tournamentSeed: result.tournament.tournamentSeed,
    scenarioName: result.tournament.scenarioName,
    agents: result.tournament.agents,
    matches: result.tournament.matches,
    ...(result.tournament.modeProfile !== undefined && { modeProfile: result.tournament.modeProfile }),
    ...(result.tournament.harnessVersion !== undefined && {
      harnessVersion: result.tournament.harnessVersion,
    }),
    createdAt: new Date().toISOString(),
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

export async function writeTournamentArtifacts(
  result: TournamentResult,
  outDir: string,
): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  const provenance = await buildMatchManifestProvenance(result);
  const tournamentManifest = buildTournamentManifest(result);
  const tournamentManifestJson = ensureSingleTrailingNewline(stableStringify(tournamentManifest));
  writeFileSync(join(outDir, "tournament_manifest.json"), tournamentManifestJson, "utf-8");
  writeFileSync(
    join(outDir, "tournament.json"),
    tournamentManifestJson,
    "utf-8",
  );
  writeFileSync(
    join(outDir, "standings.json"),
    stableStringify(result.standings) + "\n",
    "utf-8",
  );

  const matchesDir = join(outDir, "matches");
  mkdirSync(matchesDir, { recursive: true });
  const logHashes: string[] = [];

  for (const summary of result.matchSummaries) {
    const matchDir = join(matchesDir, summary.matchKey);
    mkdirSync(matchDir, { recursive: true });

    const manifest = buildMatchManifest(
      result,
      summary.matchKey,
      summary.matchId,
      summary.seed,
      summary.agentIds,
      provenance,
    );
    writeFileSync(
      join(matchDir, "match_manifest.json"),
      ensureSingleTrailingNewline(stableStringify(manifest)),
      "utf-8",
    );

    assertMatchLogs(summary.matchKey, result.matchLogs);
    const events = result.matchLogs[summary.matchKey];
    const matchLogPath = join(matchDir, "match.jsonl");
    writeFileSync(matchLogPath, toStableJsonl(events), "utf-8");

    const logHash = await hashFile(matchLogPath);
    const manifestHash = hashManifestCore(manifest as unknown as Record<string, unknown>);
    logHashes.push(logHash);

    const summaryWithHashes = {
      ...summary,
      hashes: {
        logHash,
        manifestHash,
      },
    };
    writeFileSync(
      join(matchDir, "match_summary.json"),
      ensureSingleTrailingNewline(stableStringify(summaryWithHashes)),
      "utf-8",
    );

    const moments = detectMoments(events);
    if (moments.length > 0) {
      writeFileSync(
        join(matchDir, "moments.json"),
        ensureSingleTrailingNewline(stableStringify(moments)),
        "utf-8",
      );

      const highlights = generateHighlights(moments, summary);
      if (highlights) {
        writeFileSync(
          join(matchDir, "highlights.json"),
          ensureSingleTrailingNewline(stableStringify(highlights)),
          "utf-8",
        );
      }
      // TODO: Add highlights.json to broadcast_manifest.json (class: "show") when available.
    }
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
}

export async function buildTournamentBundle(result: TournamentResult): Promise<TournamentBundleV1> {
  const summaryLookup = new Map(result.matchSummaries.map((summary) => [summary.matchKey, summary]));
  const provenance = await buildMatchManifestProvenance(result);

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

export async function writeTournamentBundle(result: TournamentResult, outPath: string): Promise<void> {
  const bundle = await buildTournamentBundle(result);
  writeFileSync(outPath, stableStringify(bundle) + "\n", "utf-8");
}
