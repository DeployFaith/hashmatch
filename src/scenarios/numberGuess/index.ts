import type { AdjudicationResult, Scenario } from "../../contract/interfaces.js";
import type { AgentId, JsonValue, Seed } from "../../contract/types.js";
import { createRng, randomInt } from "../../core/rng.js";

// ---------------------------------------------------------------------------
// State & observation types
// ---------------------------------------------------------------------------

export interface AgentFeedback {
  lastGuess: number | null;
  feedback: "higher" | "lower" | "correct" | "invalid" | null;
  guessCount: number;
}

export interface NumberGuessState {
  secretNumber: number;
  range: { min: number; max: number };
  agentFeedback: Record<AgentId, AgentFeedback>;
  winner: AgentId | null;
}

export interface NumberGuessObservation {
  rangeMin: number;
  rangeMax: number;
  lastGuess: number | null;
  feedback: "higher" | "lower" | "correct" | "invalid" | null;
  turn: number;
}

export interface NumberGuessAction {
  guess: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_RANGE_MIN = 1;
export const DEFAULT_RANGE_MAX = 100;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNumberGuessScenario(
  rangeMin: number = DEFAULT_RANGE_MIN,
  rangeMax: number = DEFAULT_RANGE_MAX,
): Scenario<NumberGuessState, NumberGuessObservation, NumberGuessAction> {
  return {
    name: "NumberGuess",

    init(seed: Seed, agentIds: AgentId[]): NumberGuessState {
      const rng = createRng(seed);
      const secretNumber = randomInt(rng, rangeMin, rangeMax);
      const agentFeedback: Record<AgentId, AgentFeedback> = {};
      for (const id of agentIds) {
        agentFeedback[id] = { lastGuess: null, feedback: null, guessCount: 0 };
      }
      return { secretNumber, range: { min: rangeMin, max: rangeMax }, agentFeedback, winner: null };
    },

    observe(state: NumberGuessState, agentId: AgentId): NumberGuessObservation {
      const fb = state.agentFeedback[agentId];
      return {
        rangeMin: state.range.min,
        rangeMax: state.range.max,
        lastGuess: fb?.lastGuess ?? null,
        feedback: fb?.feedback ?? null,
        turn: Object.values(state.agentFeedback).reduce((s, f) => s + f.guessCount, 0),
      };
    },

    adjudicate(
      state: NumberGuessState,
      agentId: AgentId,
      action: NumberGuessAction,
    ): AdjudicationResult<NumberGuessState> {
      const guess = action.guess;

      // Validate action
      if (
        typeof guess !== "number" ||
        !Number.isInteger(guess) ||
        guess < state.range.min ||
        guess > state.range.max
      ) {
        return {
          valid: false,
          state: {
            ...state,
            agentFeedback: {
              ...state.agentFeedback,
              [agentId]: {
                ...state.agentFeedback[agentId],
                lastGuess: guess,
                feedback: "invalid" as const,
              },
            },
          },
          feedback: { error: "Invalid guess: out of range or non-integer", guess },
        };
      }

      let feedback: "higher" | "lower" | "correct";
      let winner = state.winner;

      if (guess === state.secretNumber) {
        feedback = "correct";
        winner = agentId;
      } else if (guess < state.secretNumber) {
        feedback = "higher";
      } else {
        feedback = "lower";
      }

      const prev = state.agentFeedback[agentId];
      return {
        valid: true,
        state: {
          ...state,
          agentFeedback: {
            ...state.agentFeedback,
            [agentId]: {
              lastGuess: guess,
              feedback,
              guessCount: prev.guessCount + 1,
            },
          },
          winner,
        },
        feedback: { feedback },
      };
    },

    isTerminal(state: NumberGuessState): boolean {
      return state.winner !== null;
    },

    score(state: NumberGuessState): Record<AgentId, number> {
      const scores: Record<AgentId, number> = {};
      for (const id of Object.keys(state.agentFeedback)) {
        scores[id] = id === state.winner ? 100 : 0;
      }
      return scores;
    },

    summarize(state: NumberGuessState): JsonValue {
      const feedback: Record<string, JsonValue> = {};
      for (const [id, fb] of Object.entries(state.agentFeedback)) {
        feedback[id] = {
          lastGuess: fb.lastGuess,
          feedback: fb.feedback,
          guessCount: fb.guessCount,
        };
      }
      return {
        winner: state.winner,
        secretNumber: state.secretNumber,
        agentFeedback: feedback,
      };
    },
  };
}
