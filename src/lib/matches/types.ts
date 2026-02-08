export interface MatchSummaryHashes {
  logHash: string;
  manifestHash: string;
}

export interface MatchSummaryRecord {
  matchId: string;
  matchKey: string;
  seed: number;
  agentIds: string[];
  scores: Record<string, number>;
  winner: string | null;
  turns: number;
  reason: string;
  hashes?: MatchSummaryHashes;
}

export type MatchStatusState = "running" | "complete" | "incomplete" | "failed";

export interface MatchStatusRecord {
  status: MatchStatusState;
  startedAt: string;
  endedAt?: string;
  error?: string;
}

export interface MatchArtifactsIndex {
  summary: string;
  manifest?: string;
  log?: string;
  moments?: string;
  highlights?: string;
  broadcastManifest?: string;
  status?: string;
}

export interface MatchListItem {
  matchId: string;
  scenarioName?: string;
  status?: MatchStatusRecord | null;
  summary: MatchSummaryRecord;
}

export interface MatchDetailResponse {
  matchId: string;
  scenarioName?: string;
  status?: MatchStatusRecord | null;
  summary: MatchSummaryRecord;
  artifacts: MatchArtifactsIndex;
}
