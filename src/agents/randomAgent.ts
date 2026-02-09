import type { Agent, AgentConfig, AgentContext } from "../contract/interfaces.js";
import type { AgentId } from "../contract/types.js";
import type { NumberGuessAction, NumberGuessObservation } from "../scenarios/numberGuess/index.js";
import { randomInt } from "../core/rng.js";

// TODO(llm-policy-alignment): This agent is scripted/deterministic (seeded RNG,
// no LLM call). Under the "all agents are real LLM calls" policy it conflicts.
// Decision needed: (B) migrate to an LLM test profile that prompts an LLM to
// play randomly, or (C) keep deterministic as a baseline/smoke-test agent and
// explicitly tag as agentType:"scripted" in provenance metadata.
// Currently used in: contract.test.ts, gateway-runner.test.ts, jsonl-determinism.test.ts,
// run-demo CLI, tournament runner registry (key: "random").
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
