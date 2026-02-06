import { describe, expect, it } from "vitest";
import { runMatch } from "../src/engine/runMatch.js";
import { createNumberGuessScenario } from "../src/scenarios/numberGuess/index.js";
import { createRandomAgent } from "../src/agents/randomAgent.js";
import { createBaselineAgent } from "../src/agents/baselineAgent.js";
import { toStableJsonl } from "../src/core/json.js";
import type { JsonValue } from "../src/contract/types.js";

function makeAgents() {
  return [createRandomAgent("random-1"), createBaselineAgent("baseline-1")];
}

describe("JSONL determinism", () => {
  it("produces byte-identical JSONL for identical match inputs", () => {
    const scenario = createNumberGuessScenario();
    const agents = makeAgents();
    const result1 = runMatch(scenario, agents, { seed: 123, maxTurns: 20 });

    const scenario2 = createNumberGuessScenario();
    const agents2 = makeAgents();
    const result2 = runMatch(scenario2, agents2, { seed: 123, maxTurns: 20 });

    const jsonl1 = toStableJsonl(result1.events as unknown as JsonValue[]);
    const jsonl2 = toStableJsonl(result2.events as unknown as JsonValue[]);

    expect(jsonl1).toBe(jsonl2);
  });
});
