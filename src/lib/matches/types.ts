import type { ReplayMoment } from "@/lib/replay";
import type { StandingsRow } from "@/tournament/types";

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

export type MatchStatusState =
  | "running"
  | "complete"
  | "incomplete"
  | "failed"
  | "completed"
  | "crashed";

export interface MatchStatusRecord {
  matchId?: string;
  status: MatchStatusState;
  scenario?: string;
  agents?: string[];
  seed?: number;
  startedAt: string;
  endedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
}

export type MatchRunState = "running" | "completed" | "crashed" | "unknown";

export interface MatchRunStatusResponse {
  status: MatchRunState;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
}

export interface MatchArtifactsIndex {
  summary: string;
  manifest?: string;
  log?: string;
  moments?: string;
  highlights?: string;
  broadcastManifest?: string;
  verification?: string;
  status?: string;
}

export type VerificationStatus = "verified" | "failed" | "pending";

export interface VerificationResult {
  status: VerificationStatus;
  checks: {
    logHash: boolean;
    manifestHash: boolean;
  };
  verifiedAt: string;
}

export interface MatchListItem {
  matchId: string;
  scenarioName?: string;
  status?: MatchStatusRecord | null;
  summary: MatchSummaryRecord;
}

export type AgentProfileType = "scripted" | "llm" | "http";

export interface AgentRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface AgentProfile {
  agentId: string;
  record?: AgentRecord;
  points?: number;
  type?: AgentProfileType;
}

export interface MatchDetailResponse {
  matchId: string;
  scenarioName?: string;
  status?: MatchStatusRecord | null;
  summary: MatchSummaryRecord;
  artifacts: MatchArtifactsIndex;
  verification?: VerificationResult | null;
  agentProfiles: Record<string, AgentProfile>;
  moments: ReplayMoment[];
  standings: StandingsRow[] | null;
}
