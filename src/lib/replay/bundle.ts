import type { MatchKey, MatchSummary, StandingsRow, TournamentResult } from "../../tournament/types.js";

export type TournamentBundleV1 = {
  version: 1;
  tournament: TournamentResult["tournament"];
  standings: StandingsRow[];
  matches: Array<{
    matchKey: MatchKey;
    summary?: MatchSummary;
    jsonl: string;
  }>;
};
