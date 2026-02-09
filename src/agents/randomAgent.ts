import type { Agent, AgentConfig, AgentContext } from "../contract/interfaces.js";
import type { AgentId } from "../contract/types.js";
import type { NumberGuessAction, NumberGuessObservation } from "../scenarios/numberGuess/index.js";
import { randomInt } from "../core/rng.js";

// Scripted deterministic agent (seeded RNG, no LLM call). Category (B): will be
// migrated to an LLM-backed version once the provider gateway lands — see #125.
// The scripted version remains as a deterministic regression baseline.
// Tagged purpose:"test" in the tournament registry; non-publishable.
/**
 * An agent that picks a random number within the full scenario range each turn.
 * Uses only the seeded RNG provided via context — never Math.random.
 */
export function createRandomAgent(id: AgentId): Agent<NumberGuessObservation, NumberGuessAction> {
  return {
    id,
    init(_config: AgentConfig): void {
      // stateless — nothing to initialize
    },
    act(observation: NumberGuessObservation, ctx: AgentContext): NumberGuessAction {
      const obs = observation as unknown as Record<string, unknown>;
      const rangeMin = Number(obs.rangeMin);
      const rangeMax = Number(obs.rangeMax);

      if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax) || rangeMax < rangeMin) {
        return { guess: 0 };
      }

      return { guess: randomInt(ctx.rng, rangeMin, rangeMax) };
    },
  };
}
