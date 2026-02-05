import type { Agent, AgentConfig, AgentContext } from "../contract/interfaces.js";
import type { AgentId } from "../contract/types.js";
import type { NumberGuessAction, NumberGuessObservation } from "../scenarios/numberGuess/index.js";
import { randomInt } from "../core/rng.js";

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
      return { guess: randomInt(ctx.rng, observation.rangeMin, observation.rangeMax) };
    },
  };
}
