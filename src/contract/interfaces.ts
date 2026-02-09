import type { AgentId, JsonValue, MatchProvenance, Seed } from "./types.js";

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/** Configuration handed to an agent before the match begins. */
export interface AgentConfig {
  agentId: AgentId;
  seed: Seed;
}

/** Per-turn context provided alongside the observation. */
export interface AgentContext {
  /** Seeded PRNG scoped to this agent — use instead of Math.random. */
  rng: () => number;
  turn: number;
  agentId: AgentId;
}

/** An agent that can participate in a match. */
export interface Agent<TObs = JsonValue, TAct = JsonValue> {
  readonly id: AgentId;
  init(config: AgentConfig): void;
  act(observation: TObs, ctx: AgentContext): TAct | Promise<TAct>;
}

// ---------------------------------------------------------------------------
// Game Briefing
// ---------------------------------------------------------------------------

/** Describes a single legal action type for a game briefing. */
export interface GameBriefingAction {
  type: string;
  description: string;
  jsonExample: JsonValue;
  notes?: string[];
}

/** Describes a single observation field for a game briefing. */
export interface GameBriefingObservationField {
  field: string;
  description: string;
}

/**
 * Structured, scenario-agnostic rule briefing delivered to agents at turn 1.
 *
 * This is a rulebook, not a walkthrough: it covers action schemas, win
 * conditions, and observation layout. It never contains hidden state, map
 * data, or strategy advice.
 *
 * Safe for public artifacts (e.g. spectator pages).
 */
export interface GameBriefing {
  gameId: string;
  name: string;
  summary: string;
  winCondition: string;
  actions: GameBriefingAction[];
  observationGuide: GameBriefingObservationField[];
  rulesNotes?: string[];
  version: string;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

/** Result returned by a scenario after adjudicating an action. */
export interface AdjudicationResult<TState> {
  valid: boolean;
  state: TState;
  feedback: JsonValue;
}

/**
 * Scenario-defined telemetry hints for failure mode classification.
 *
 * These hints must be derived from scenario code, not user-edited metadata.
 */
export interface ScenarioHints {
  /** Scenario-defined action types that count as no-ops. */
  noopActions: string[];
  /** Conservative estimate of the action space size. */
  actionSpaceSize: number;
  /** Optional cap for prerequisite chain depth (if applicable). */
  maxChainDepth?: number;
}

/** A scenario (game / simulation) defining rules and scoring. */
export interface Scenario<TState = unknown, TObs = JsonValue, TAct = JsonValue> {
  readonly name: string;
  /** Create initial state from a seed and the participating agent ids. */
  init(seed: Seed, agentIds: AgentId[]): TState;
  /** Derive an observation for a specific agent from the current state. */
  observe(state: TState, agentId: AgentId): TObs;
  /** Validate and apply an agent's action, returning new state + feedback. */
  adjudicate(state: TState, agentId: AgentId, action: TAct): AdjudicationResult<TState>;
  /** Whether the match should end. */
  isTerminal(state: TState): boolean;
  /** Final scores keyed by agent id. */
  score(state: TState): Record<AgentId, number>;
  /** JSON-serializable summary of state for the event log. */
  summarize(state: TState): JsonValue;
  /** Default action to use when an agent fails to respond in time. */
  getDefaultAction(): TAct;
  /** Scenario hints for FM telemetry; must be derived from scenario code. */
  getScenarioHints(): ScenarioHints;
  /** Optional end-of-match reveal (e.g. hidden secrets). Included in MatchEnded.details. */
  reveal?(state: TState): JsonValue;
  /** Optional structured rule briefing injected into the turn-1 observation as gameRules. */
  getBriefing?(): GameBriefing;
}

// ---------------------------------------------------------------------------
// Match runner config
// ---------------------------------------------------------------------------

/** Configuration for a single match run. */
export interface MatchRunnerConfig {
  seed: Seed;
  maxTurns: number;
  matchId?: string;
  provenance?: MatchProvenance;
  maxTurnTimeMs?: number;
  maxConsecutiveTimeouts?: number;
  modeProfile?: JsonValue;
  divisionConfig?: JsonValue;
}
