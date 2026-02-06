import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableStringify, toStableJsonl } from "../core/json.js";
import type { MatchEvent } from "../contract/types.js";
import type { TournamentBundleV1 } from "../lib/replay/bundle.js";
import type { JsonValue } from "../contract/types.js";
import type { MatchKey, MatchManifest, TournamentResult } from "./types.js";

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
): MatchManifest {
  const modeProfileId = resolveModeProfileId(result.tournament.modeProfile);
  const scenarioId = result.tournament.scenarioName;
  const harnessVersion = result.tournament.harnessVersion ?? null;

  return {
    matchId,
    modeProfileId,
    scenario: {
      id: scenarioId,
      version: null,
      contractVersion: null,
      contentHash: null,
    },
    agents: agentIds.map((id) => ({
      id,
      version: null,
      contentHash: null,
    })),
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

function assertMatchLogs(
  matchKey: MatchKey,
  matchLogs: TournamentResult["matchLogs"],
): asserts matchLogs is Record<MatchKey, MatchEvent[]> {
  if (!matchLogs || !matchLogs[matchKey]) {
    throw new Error(`Missing event log for matchKey "${matchKey}"`);
  }
}

export function writeTournamentArtifacts(result: TournamentResult, outDir: string): void {
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, "tournament.json"),
    stableStringify(result.tournament) + "\n",
    "utf-8",
  );
  writeFileSync(
    join(outDir, "standings.json"),
    stableStringify(result.standings) + "\n",
    "utf-8",
  );

  const matchesDir = join(outDir, "matches");
  mkdirSync(matchesDir, { recursive: true });

  for (const summary of result.matchSummaries) {
    const matchDir = join(matchesDir, summary.matchKey);
    mkdirSync(matchDir, { recursive: true });

    writeFileSync(
      join(matchDir, "match_summary.json"),
      stableStringify(summary) + "\n",
      "utf-8",
    );

    const manifest = buildMatchManifest(
      result,
      summary.matchKey,
      summary.matchId,
      summary.seed,
      summary.agentIds,
    );
    writeFileSync(
      join(matchDir, "match_manifest.json"),
      stableStringify(manifest) + "\n",
      "utf-8",
    );

    assertMatchLogs(summary.matchKey, result.matchLogs);
    const events = result.matchLogs[summary.matchKey];
    writeFileSync(join(matchDir, "match.jsonl"), toStableJsonl(events), "utf-8");
  }
}

export function buildTournamentBundle(result: TournamentResult): TournamentBundleV1 {
  const summaryLookup = new Map(result.matchSummaries.map((summary) => [summary.matchKey, summary]));

  const matches = result.tournament.matches.map((spec) => {
    assertMatchLogs(spec.matchKey, result.matchLogs);
    const events = result.matchLogs[spec.matchKey];
    const summary = summaryLookup.get(spec.matchKey);
    const manifest = summary
      ? buildMatchManifest(result, spec.matchKey, summary.matchId, summary.seed, summary.agentIds)
      : undefined;
    return {
      matchKey: spec.matchKey,
      ...(summary ? { summary } : {}),
      ...(manifest ? { manifest } : {}),
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

export function writeTournamentBundle(result: TournamentResult, outPath: string): void {
  const bundle = buildTournamentBundle(result);
  writeFileSync(outPath, stableStringify(bundle) + "\n", "utf-8");
}
