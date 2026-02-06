import type { AgentId, MatchEvent, MatchId, Seed } from "../contract/types.js";

/** Configuration for a round-robin tournament. */
export interface TournamentConfig {
  seed: Seed;
  maxTurns: number;
  rounds: number;
  scenarioKey: string;
  agentKeys: string[];
  /** If true, include full per-match event logs in the result. */
  includeEventLogs?: boolean;
}

/** Summary of a single match within a tournament. */
export interface MatchSummary {
  matchId: MatchId;
  seed: Seed;
  /** Stable participant IDs in index order [lower, higher]. */
  agentIds: AgentId[];
  /** Actual seating order passed to runMatch: seats[0] acts first. */
  seats: [AgentId, AgentId];
  scores: Record<AgentId, number>;
  winner: AgentId | null;
  turns: number;
  reason: string;
}

/** A row in the tournament standings table. */
export interface StandingsRow {
  agentId: AgentId;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
}

/** Complete result of a tournament run. */
export interface TournamentResult {
  config: TournamentConfig;
  matches: MatchSummary[];
  standings: StandingsRow[];
  /** Per-match event logs, keyed by matchId. Only present when config.includeEventLogs is true. */
  matchLogs?: Record<MatchId, MatchEvent[]>;
}
