import type { AdjudicationResult, Scenario } from "../../contract/interfaces.js";
import type { AgentId, JsonValue, Seed } from "../../contract/types.js";
import { createRng, randomInt } from "../../core/rng.js";
import { getResourceRivalsBriefing } from "./briefing.js";

// ---------------------------------------------------------------------------
// State & observation types
// ---------------------------------------------------------------------------

export interface Objective {
  value: number;
}

export interface BidRecord {
  turn: number;
  objectiveValue: number;
  bids: Record<AgentId, number>;
  winner: AgentId | null;
}

export interface ResourceRivalsState {
  /** Total starting resources per agent. */
  startingResources: number;
  /** Current remaining resources per agent. */
  resources: Record<AgentId, number>;
  /** Cumulative captured score per agent. */
  capturedScore: Record<AgentId, number>;
  /** Ordered list of objectives to contest. */
  objectives: Objective[];
  /** Index of the current objective (0-based). */
  currentObjective: number;
  /** Bids collected this turn (partial — one per agent). */
  pendingBids: Record<AgentId, number>;
  /** Full bid history (one entry per resolved objective). */
  bidHistory: BidRecord[];
  /** Ordered agent IDs for deterministic processing. */
  agentIds: AgentId[];
}

/**
 * Observation given to each agent.
 * Uses `_private` convention: `remainingResources` is hidden in spectator mode.
 */
export interface ResourceRivalsObservation {
  objectiveValue: number;
  capturedScore: number;
  objectivesRemaining: number;
  opponentCapturedScore: number;
  lastResult: {
    objectiveValue: number;
    myBid: number;
    opponentBid: number;
    winner: AgentId | null;
  } | null;
  _private: {
    remainingResources: number;
  };
}

export type ResourceRivalsAction = { bid: number } | { type: "bid"; amount: number };

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_STARTING_RESOURCES = 100;
export const DEFAULT_MIN_OBJECTIVES = 10;
export const DEFAULT_MAX_OBJECTIVES = 15;
export const DEFAULT_MIN_OBJECTIVE_VALUE = 5;
export const DEFAULT_MAX_OBJECTIVE_VALUE = 25;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ResourceRivalsOptions {
  startingResources?: number;
  minObjectives?: number;
  maxObjectives?: number;
  minObjectiveValue?: number;
  maxObjectiveValue?: number;
}

export function createResourceRivalsScenario(
  opts: ResourceRivalsOptions = {},
): Scenario<ResourceRivalsState, ResourceRivalsObservation, ResourceRivalsAction> {
  const startingResources = opts.startingResources ?? DEFAULT_STARTING_RESOURCES;
  const minObjectives = opts.minObjectives ?? DEFAULT_MIN_OBJECTIVES;
  const maxObjectives = opts.maxObjectives ?? DEFAULT_MAX_OBJECTIVES;
  const minValue = opts.minObjectiveValue ?? DEFAULT_MIN_OBJECTIVE_VALUE;
  const maxValue = opts.maxObjectiveValue ?? DEFAULT_MAX_OBJECTIVE_VALUE;

  return {
    name: "ResourceRivals",

    init(seed: Seed, agentIds: AgentId[]): ResourceRivalsState {
      const rng = createRng(seed);
      const numObjectives = randomInt(rng, minObjectives, maxObjectives);
      const objectives: Objective[] = [];
      for (let i = 0; i < numObjectives; i++) {
        objectives.push({ value: randomInt(rng, minValue, maxValue) });
      }

      const resources: Record<AgentId, number> = {};
      const capturedScore: Record<AgentId, number> = {};
      for (const id of agentIds) {
        resources[id] = startingResources;
        capturedScore[id] = 0;
      }

      return {
        startingResources,
        resources,
        capturedScore,
        objectives,
        currentObjective: 0,
        pendingBids: {},
        bidHistory: [],
        agentIds: [...agentIds],
      };
    },

    observe(state: ResourceRivalsState, agentId: AgentId): ResourceRivalsObservation {
      const objective = state.objectives[state.currentObjective];
      const myScore = state.capturedScore[agentId] ?? 0;
      const opponentId = state.agentIds.find((id) => id !== agentId) ?? agentId;
      const opponentScore = state.capturedScore[opponentId] ?? 0;

      const lastBid =
        state.bidHistory.length > 0 ? state.bidHistory[state.bidHistory.length - 1] : null;
      const lastResult = lastBid
        ? {
            objectiveValue: lastBid.objectiveValue,
            myBid: lastBid.bids[agentId] ?? 0,
            opponentBid: lastBid.bids[opponentId] ?? 0,
            winner: lastBid.winner,
          }
        : null;

      return {
        objectiveValue: objective.value,
        capturedScore: myScore,
        objectivesRemaining: state.objectives.length - state.currentObjective,
        opponentCapturedScore: opponentScore,
        lastResult,
        _private: {
          remainingResources: state.resources[agentId] ?? 0,
        },
      };
    },

    adjudicate(
      state: ResourceRivalsState,
      agentId: AgentId,
      action: ResourceRivalsAction,
    ): AdjudicationResult<ResourceRivalsState> {
      const bid = resolveBidAmount(action);
      const remaining = state.resources[agentId] ?? 0;

      // Validate bid
      if (typeof bid !== "number" || !Number.isInteger(bid) || bid < 0 || bid > remaining) {
        // Invalid bid: treat as 0 bid, penalize by not participating
        const newPendingBids = { ...state.pendingBids, [agentId]: 0 };
        const newState = maybeResolveBids({ ...state, pendingBids: newPendingBids });
        return {
          valid: false,
          state: newState,
          feedback: {
            error: `Invalid bid: must be integer in [0, ${remaining}]`,
            bid: bid ?? null,
          },
        };
      }

      // Record the bid
      const newPendingBids = { ...state.pendingBids, [agentId]: bid };
      const newState = maybeResolveBids({ ...state, pendingBids: newPendingBids });

      return {
        valid: true,
        state: newState,
        feedback: { accepted: true, bid },
      };
    },

    isTerminal(state: ResourceRivalsState): boolean {
      return state.currentObjective >= state.objectives.length;
    },

    score(state: ResourceRivalsState): Record<AgentId, number> {
      return { ...state.capturedScore };
    },

    summarize(state: ResourceRivalsState): JsonValue {
      // Public summary: scores and current objective (no resources!)
      return {
        scores: { ...state.capturedScore },
        currentObjective: state.currentObjective,
        totalObjectives: state.objectives.length,
      };
    },

    getDefaultAction(): ResourceRivalsAction {
      return { type: "bid", amount: 0 };
    },

    getScenarioHints() {
      return {
        noopActions: [],
        actionSpaceSize: Math.max(0, startingResources + 1),
      };
    },

    getBriefing: getResourceRivalsBriefing,

    reveal(state: ResourceRivalsState): JsonValue {
      return {
        finalResources: { ...state.resources },
        bidHistory: state.bidHistory.map((b) => ({
          turn: b.turn,
          objectiveValue: b.objectiveValue,
          bids: b.bids,
          winner: b.winner,
        })),
        objectives: state.objectives.map((o) => o.value),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Bid resolution
// ---------------------------------------------------------------------------

function resolveBidAmount(action: ResourceRivalsAction): number | undefined {
  if (!action || typeof action !== "object") {
    return undefined;
  }
  if ("bid" in action) {
    return (action as { bid?: number }).bid;
  }
  if ("type" in action && (action as { type?: string }).type === "bid") {
    return (action as { amount?: number }).amount;
  }
  return undefined;
}

/**
 * If all agents have submitted bids for the current objective, resolve the
 * bidding round and advance to the next objective.
 */
function maybeResolveBids(state: ResourceRivalsState): ResourceRivalsState {
  // Check if all agents have bid
  for (const id of state.agentIds) {
    if (!(id in state.pendingBids)) {
      return state;
    }
  }

  // All bids are in — resolve
  const objective = state.objectives[state.currentObjective];
  const bids = { ...state.pendingBids };

  // Deduct resources
  const newResources = { ...state.resources };
  for (const [id, bid] of Object.entries(bids)) {
    newResources[id] = (newResources[id] ?? 0) - bid;
  }

  // Determine winner (highest bid wins; ties = no one wins, resources still spent)
  const entries = Object.entries(bids).sort((a, b) => b[1] - a[1]);
  let winner: AgentId | null = null;
  if (entries.length >= 2 && entries[0][1] > entries[1][1]) {
    winner = entries[0][0];
  }

  // Award score
  const newCapturedScore = { ...state.capturedScore };
  if (winner) {
    newCapturedScore[winner] = (newCapturedScore[winner] ?? 0) + objective.value;
  }

  const bidRecord: BidRecord = {
    turn: state.currentObjective + 1,
    objectiveValue: objective.value,
    bids,
    winner,
  };

  return {
    ...state,
    resources: newResources,
    capturedScore: newCapturedScore,
    currentObjective: state.currentObjective + 1,
    pendingBids: {},
    bidHistory: [...state.bidHistory, bidRecord],
  };
}
