import type { Agent, AgentConfig, AgentContext } from "../contract/interfaces.js";
import type { AgentId } from "../contract/types.js";
import type { NumberGuessAction, NumberGuessObservation } from "../scenarios/numberGuess/index.js";

// Scripted deterministic agent — no LLM call. Category (B): will be migrated
// to an LLM-backed version once the provider gateway lands — see #125.
// The scripted version remains as a deterministic regression baseline.
// Tagged purpose:"test" in the tournament registry; non-publishable.
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
      const obs = observation as unknown as Record<string, unknown>;
      const rangeMin = Number(obs.rangeMin);
      const rangeMax = Number(obs.rangeMax);

      if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax) || rangeMax < rangeMin) {
        return { guess: 0 };
      }

      // Bootstrap bounds from the first observation
      if (low === 0 && high === 0) {
        low = rangeMin;
        high = rangeMax;
      }

      // Narrow bounds based on feedback
      const feedback = obs.feedback;
      const rawLastGuess = obs.lastGuess;
      const lastGuess =
        typeof rawLastGuess === "number" && Number.isFinite(rawLastGuess) ? rawLastGuess : null;

      if (feedback === "higher" && lastGuess !== null) {
        low = Math.max(low, lastGuess + 1);
      } else if (feedback === "lower" && lastGuess !== null) {
        high = Math.min(high, lastGuess - 1);
      }

      const guess = Math.floor((low + high) / 2);
      return { guess };
    },
  };
}
