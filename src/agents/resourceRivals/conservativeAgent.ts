import type { Agent, AgentConfig, AgentContext } from "../../contract/interfaces.js";
import type { AgentId } from "../../contract/types.js";
import type {
  ResourceRivalsObservation,
  ResourceRivalsAction,
} from "../../scenarios/resourceRivals/index.js";

// TODO(llm-policy-alignment): Scripted deterministic agent — no LLM call.
// Same policy conflict as randomBidder. Decision: (B) or (C).
// Used in: resourceRivals.test.ts, agent-compat.test.ts, tournament registry
// (key: "conservative"), redaction-audit fixture generation.
/**
 * Conservative agent for Resource Rivals.
 *
 * Spreads resources evenly across remaining objectives, with a slight
 * bias toward higher-value objectives.  Uses seeded RNG for small
 * perturbations to avoid perfectly predictable bidding.
 */
export function createConservativeAgent(
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
      const objectivesLeft = Number(obs.objectivesRemaining);
      const objectiveValue = Number(obs.objectiveValue);

      if (
        !Number.isFinite(remaining) ||
        !Number.isFinite(objectivesLeft) ||
        !Number.isFinite(objectiveValue) ||
        remaining <= 0 ||
        objectivesLeft <= 0
      ) {
        return { bid: 0 };
      }

      // Base allocation: spread evenly
      const baseBid = Math.floor(remaining / objectivesLeft);

      // Value-weighted adjustment: bid more for valuable objectives
      // Use a simple proportion relative to a "typical" objective value of 15
      const valueFactor = Math.min(objectiveValue / 15, 2);
      const adjustedBid = Math.floor(baseBid * valueFactor);

      // Add small random perturbation (±10% of base) to avoid predictability
      const perturbation = Math.floor(baseBid * 0.1 * (ctx.rng() * 2 - 1));
      const finalBid = Math.max(0, Math.min(remaining, adjustedBid + perturbation));

      return { bid: finalBid };
    },
  };
}
