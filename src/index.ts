// Contract types
export type {
  AgentId,
  MatchId,
  Seed,
  JsonValue,
  MatchEvent,
  MatchProvenance,
  MatchStartedEvent,
  TurnStartedEvent,
  ObservationEmittedEvent,
  ActionSubmittedEvent,
  ActionAdjudicatedEvent,
  StateUpdatedEvent,
  AgentErrorEvent,
  MatchEndedEvent,
  MatchResult,
} from "./contract/types.js";

// Contract interfaces
export type {
  Agent,
  Scenario,
  MatchRunnerConfig,
  AgentContext,
  AgentConfig,
  AdjudicationResult,
} from "./contract/interfaces.js";

// Core
export { createRng, randomInt, deriveSeed } from "./core/rng.js";

// Engine
export { runMatch } from "./engine/runMatch.js";

// Tournament
export { runTournament } from "./tournament/runTournament.js";
export type {
  TournamentConfig,
  MatchSummary,
  StandingsRow,
  TournamentResult,
} from "./tournament/types.js";
