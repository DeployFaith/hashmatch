import type { AgentId, JsonValue, Seed } from "./types.js";

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
  act(observation: TObs, ctx: AgentContext): TAct;
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
}

// ---------------------------------------------------------------------------
// Match runner config
// ---------------------------------------------------------------------------

/** Configuration for a single match run. */
export interface MatchRunnerConfig {
  seed: Seed;
  maxTurns: number;
  matchId?: string;
}
