/** Branded string types for domain clarity. */
export type AgentId = string;
export type MatchId = string;
export type Seed = number;

/** A JSON-serializable value (no functions, no undefined). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Optional metadata describing the engine that produced a replay. */
export interface MatchProvenance {
  engineCommit?: string;
  engineVersion?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Fields shared by every event. */
export interface BaseEvent {
  type: string;
  seq: number;
  matchId: MatchId;
}

export interface MatchStartedEvent extends BaseEvent {
  type: "MatchStarted";
  seed: Seed;
  agentIds: AgentId[];
  scenarioName: string;
  maxTurns: number;
  engineCommit?: string;
  engineVersion?: string;
}

export interface TurnStartedEvent extends BaseEvent {
  type: "TurnStarted";
  turn: number;
}

export interface ObservationEmittedEvent extends BaseEvent {
  type: "ObservationEmitted";
  agentId: AgentId;
  turn: number;
  observation: JsonValue;
}

export interface ActionSubmittedEvent extends BaseEvent {
  type: "ActionSubmitted";
  agentId: AgentId;
  turn: number;
  action: JsonValue;
}

export interface ActionAdjudicatedEvent extends BaseEvent {
  type: "ActionAdjudicated";
  agentId: AgentId;
  turn: number;
  valid: boolean;
  feedback: JsonValue;
}

export interface StateUpdatedEvent extends BaseEvent {
  type: "StateUpdated";
  turn: number;
  summary: JsonValue;
}

export interface AgentErrorEvent extends BaseEvent {
  type: "AgentError";
  agentId: AgentId;
  turn: number;
  message: string;
}

export interface MatchEndedEvent extends BaseEvent {
  type: "MatchEnded";
  reason: "completed" | "maxTurnsReached" | "error";
  scores: Record<AgentId, number>;
  turns: number;
  /** Optional scenario-specific details revealed at match end (e.g. secret values). */
  details?: JsonValue;
}

/** Discriminated union of all match events. */
export type MatchEvent =
  | MatchStartedEvent
  | TurnStartedEvent
  | ObservationEmittedEvent
  | ActionSubmittedEvent
  | ActionAdjudicatedEvent
  | StateUpdatedEvent
  | AgentErrorEvent
  | MatchEndedEvent;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Completed match result containing the full event log. */
export interface MatchResult {
  matchId: MatchId;
  seed: Seed;
  scores: Record<AgentId, number>;
  events: MatchEvent[];
  turns: number;
}
