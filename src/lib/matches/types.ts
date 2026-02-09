import type { FailureModeProfile } from "@/lib/fm";
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
  timeoutsPerAgent: Record<string, number>;
  forfeitedBy?: string;
  winner: string | null;
  turns: number;
  reason: string;
  hashes?: MatchSummaryHashes;
  failureModes?: FailureModeProfile;
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

// TODO(llm-policy-alignment): The "scripted" bucket conflates two distinct
// categories: (1) deterministic classifier-regression fixtures that SHOULD stay
// scripted, and (2) built-in strategy agents (random, baseline, conservative)
// whose long-term policy is to become LLM-powered. Consider splitting into
// "scripted:regression" | "scripted:baseline" | "llm" | "http", or adding a
// sub-category field to AgentProfile.
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

// ---------------------------------------------------------------------------
// Frozen SSE contract types (live viewer)
// ---------------------------------------------------------------------------

/** Status as returned by the frozen /api/matches/[matchId]/status endpoint. */
export type LiveMatchStatus = "waiting" | "running" | "finished";

/** Response from GET /api/matches/[matchId]/status (frozen contract). */
export interface LiveMatchStatusResponse {
  matchId: string;
  status: LiveMatchStatus;
  scenario: string;
  agents: string[];
  startedAt: string | null;
  finishedAt: string | null;
  verified: boolean | null;
  totalTurns: number;
  currentTurn: number | null;
}

/** Data from SSE `match_status` heartbeat events. */
export interface SSEMatchStatusData {
  status: "running";
  turn: number;
  totalTurns: number;
}

/** Data from SSE `match_complete` terminal event. */
export interface SSEMatchCompleteData {
  status: "finished";
  verified: boolean;
  finalScores: Record<string, number>;
}

/** Entry from GET /api/matches (frozen contract). */
export interface LiveMatchListEntry {
  matchId: string;
  status: "running" | "finished";
  scenario: string;
  agents: string[];
  startedAt: string;
  finishedAt?: string;
}

/** Response from GET /api/matches (frozen contract). */
export interface LiveMatchListResponse {
  matches: LiveMatchListEntry[];
}
