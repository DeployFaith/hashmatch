import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableStringify, toStableJsonl } from "../core/json.js";
import type { MatchEvent } from "../contract/types.js";
import type { MatchKey, TournamentResult } from "./types.js";

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

    assertMatchLogs(summary.matchKey, result.matchLogs);
    const events = result.matchLogs[summary.matchKey];
    writeFileSync(join(matchDir, "match.jsonl"), toStableJsonl(events), "utf-8");
  }
}
