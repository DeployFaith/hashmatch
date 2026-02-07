import type { Agent, AgentConfig, AgentContext } from "../../contract/interfaces.js";
import type { AgentId } from "../../contract/types.js";
import type {
  ResourceRivalsObservation,
  ResourceRivalsAction,
} from "../../scenarios/resourceRivals/index.js";

/**
 * Random bidder agent for Resource Rivals.
 *
 * Bids a random fraction of remaining resources each turn.
 * Uses seeded RNG for determinism.
 */
export function createRandomBidderAgent(
  id: AgentId,
): Agent<ResourceRivalsObservation, ResourceRivalsAction> {
  return {
    id,
    init(_config: AgentConfig): void {
      // Stateless — nothing to initialize.
    },
    act(observation: ResourceRivalsObservation, ctx: AgentContext): ResourceRivalsAction {
      const remaining = observation._private.remainingResources;
      if (remaining <= 0) {
        return { bid: 0 };
      }
      // Bid between 0 and remaining (uniform random)
      const bid = Math.floor(ctx.rng() * (remaining + 1));
      return { bid };
    },
  };
}
