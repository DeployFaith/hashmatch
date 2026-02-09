import { describe, expect, it } from "vitest";
import { createRandomAgent } from "../src/agents/randomAgent.js";
import { createBaselineAgent } from "../src/agents/baselineAgent.js";
import { createNoopAgent } from "../src/agents/noopAgent.js";
import { createRandomBidderAgent } from "../src/agents/resourceRivals/randomBidder.js";
import { createConservativeAgent } from "../src/agents/resourceRivals/conservativeAgent.js";
import { runMatch } from "../src/engine/runMatch.js";
import { getScenarioFactory } from "../src/tournament/runTournament.js";
import { parseArgs, resolveAgentDefaults } from "../src/cli/run-match.js";
import type { AgentContext, AgentConfig } from "../src/contract/interfaces.js";

function collectNumbers(value: unknown, numbers: number[]): void {
  if (typeof value === "number") {
    numbers.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNumbers(entry, numbers));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) =>
      collectNumbers(entry, numbers),
    );
  }
}

describe("noop agent smoke tests", () => {
  it("runs matches without crashing across scenarios", async () => {
    const scenarioKeys = ["heist", "numberGuess", "resourceRivals"];

    for (const scenarioKey of scenarioKeys) {
      const scenario = getScenarioFactory(scenarioKey)();
      const agents = [createNoopAgent("noop-0"), createNoopAgent("noop-1")];
      const result = await runMatch(scenario, agents, { seed: 1, maxTurns: 5 });
      const lastEvent = result.events[result.events.length - 1];
      expect(lastEvent?.type).toBe("MatchEnded");
    }
  });
});

describe("agents handle unexpected observations", () => {
  it("returns only finite numbers when given empty observations", () => {
    const agentFactories = [
      createRandomAgent,
      createBaselineAgent,
      createNoopAgent,
      createRandomBidderAgent,
      createConservativeAgent,
    ];

    agentFactories.forEach((factory, index) => {
      const agentId = `agent-${index}`;
      const agent = factory(agentId);
      const config: AgentConfig = { agentId, seed: 1 };
      const ctx: AgentContext = { agentId, rng: () => 0.5, turn: 0 };

      agent.init(config);
      const action = agent.act({} as never, ctx);
      const numbers: number[] = [];
      collectNumbers(action, numbers);
      numbers.forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
      });
    });
  });
});

describe("CLI defaults", () => {
  it("uses scenario-specific defaults for heist", () => {
    const args = parseArgs(["--scenario", "heist"]);
    const resolved = resolveAgentDefaults(args);
    expect(resolved.agentA).toBe("llm:ollama:qwen2.5:3b");
    expect(resolved.agentB).toBe("llm:ollama:qwen2.5:3b");
    expect(resolved.warning).toBeUndefined();
  });
});
