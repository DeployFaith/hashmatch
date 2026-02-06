import type { AgentId, MatchEvent, MatchId, Seed, JsonValue } from "../contract/types.js";

export type MatchKey = string;

/** Configuration for a round-robin tournament. */
export interface TournamentConfig {
  seed: Seed;
  maxTurns: number;
  rounds: number;
  scenarioKey: string;
  agentKeys: string[];
  modeProfile?: JsonValue;
  harnessVersion?: string;
  /** If true, include full per-match event logs in the result. */
  includeEventLogs?: boolean;
}

export interface MatchSpec {
  matchKey: MatchKey;
  seed: Seed;
  scenarioName: string;
  agentIds: AgentId[];
  maxTurns: number;
}

export interface MatchManifestAgent {
  id: AgentId;
  version: string | null;
  contentHash: string | null;
}

export interface MatchManifestScenario {
  id: string;
  version: string | null;
  contractVersion: string | null;
  contentHash: string | null;
}

export interface MatchManifestConfig {
  maxTurns: number;
  seed: Seed;
  seedDerivationInputs: {
    tournamentSeed: Seed;
    matchKey: MatchKey;
  };
}

export interface MatchManifestRunner {
  name: string;
  version: string | null;
  gitCommit: string | null;
}

export interface MatchManifest {
  matchId: MatchId;
  modeProfileId: string;
  scenario: MatchManifestScenario;
  agents: MatchManifestAgent[];
  config: MatchManifestConfig;
  runner: MatchManifestRunner;
  createdAt: string;
}

/** Summary of a single match within a tournament. */
export interface MatchSummary {
  matchId: MatchId;
  matchKey: MatchKey;
  seed: Seed;
  agentIds: AgentId[];
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
  tournament: {
    tournamentSeed: Seed;
    scenarioName: string;
    agents: AgentId[];
    matches: MatchSpec[];
    modeProfile?: JsonValue;
    harnessVersion?: string;
  };
  matchSummaries: MatchSummary[];
  standings: StandingsRow[];
  /** Per-match event logs, keyed by matchKey. Only present when config.includeEventLogs is true. */
  matchLogs?: Record<MatchKey, MatchEvent[]>;
}
