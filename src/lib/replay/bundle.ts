import type {
  MatchKey,
  MatchManifest,
  MatchSummary,
  StandingsRow,
  TournamentResult,
} from "../../tournament/types.js";
import type { HighlightsFile } from "./generateHighlights.js";

export type TournamentBundleV1 = {
  version: 1;
  tournament: TournamentResult["tournament"];
  standings: StandingsRow[];
  matches: Array<{
    matchKey: MatchKey;
    summary?: MatchSummary;
    manifest?: MatchManifest;
    highlights?: HighlightsFile;
    jsonl: string;
  }>;
};
