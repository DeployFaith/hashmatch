import type { Agent, AgentConfig, AgentContext } from "../../contract/interfaces.js";
import type { AgentId } from "../../contract/types.js";
import type {
  ResourceRivalsObservation,
  ResourceRivalsAction,
} from "../../scenarios/resourceRivals/index.js";

// Scripted deterministic agent — no LLM call. Category (B): will be migrated
// to an LLM-backed version once the provider gateway lands — see #125.
// The scripted version remains as a deterministic regression baseline.
// Tagged purpose:"test" in the tournament registry; non-publishable.
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
      const obs = observation as unknown as Record<string, unknown>;
      const privateObs = obs._private as Record<string, unknown> | undefined;
      const remaining = Number(privateObs?.remainingResources);

      if (!Number.isFinite(remaining) || remaining <= 0) {
        return { bid: 0 };
      }
      // Bid between 0 and remaining (uniform random)
      const bid = Math.floor(ctx.rng() * (remaining + 1));
      return { bid };
    },
  };
}
