import type { Agent, AgentConfig, AgentContext } from "../contract/interfaces.js";
import type { AgentId } from "../contract/types.js";
import type { NumberGuessAction, NumberGuessObservation } from "../scenarios/numberGuess/index.js";

/**
 * Binary-search agent: narrows the known range based on "higher" / "lower"
 * feedback and always guesses the midpoint.
 */
export function createBaselineAgent(id: AgentId): Agent<NumberGuessObservation, NumberGuessAction> {
  let low = 0;
  let high = 0;

  return {
    id,
    init(_config: AgentConfig): void {
      low = 0;
      high = 0;
    },
    act(observation: NumberGuessObservation, _ctx: AgentContext): NumberGuessAction {
      // Bootstrap bounds from the first observation
      if (low === 0 && high === 0) {
        low = observation.rangeMin;
        high = observation.rangeMax;
      }

      // Narrow bounds based on feedback
      if (observation.feedback === "higher" && observation.lastGuess !== null) {
        low = Math.max(low, observation.lastGuess + 1);
      } else if (observation.feedback === "lower" && observation.lastGuess !== null) {
        high = Math.min(high, observation.lastGuess - 1);
      }

      const guess = Math.floor((low + high) / 2);
      return { guess };
    },
  };
}
