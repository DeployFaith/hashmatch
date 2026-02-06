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
export { stableStringify, toStableJsonl } from "./core/json.js";

// Engine
export { runMatch } from "./engine/runMatch.js";

// Tournament
export { runTournament } from "./tournament/runTournament.js";
export type {
  TournamentConfig,
  MatchKey,
  MatchSpec,
  MatchSummary,
  StandingsRow,
  TournamentResult,
} from "./tournament/types.js";

// Replay bundles
export type { TournamentBundleV1 } from "./lib/replay/bundle.js";
export {
  getVisibleCommentary,
  normalizeAndSortCommentary,
  parseCommentaryJson,
} from "./lib/replay/commentary.js";
export type {
  CommentaryDoc,
  CommentaryEntry,
  CommentaryEntryIn,
} from "./lib/replay/commentary.js";
