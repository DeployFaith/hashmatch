import { describe, expect, it } from "vitest";
import { createHeistScenario } from "../src/scenarios/heist/index.js";
import { createResourceRivalsScenario } from "../src/scenarios/resourceRivals/index.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createLlmAgent } from "../src/agents/llm/createLlmAgent.js";
import { getScenarioAdapter } from "../src/agents/llm/adapters.js";
import { resolveLlmBudgetConfig } from "../src/agents/llm/budget.js";
import { attachActionForensics } from "../src/core/agentActionMetadata.js";
import { decodeAgentAction } from "../src/core/decodeAgentAction.js";
import { z } from "zod";

const runLlmTests = process.env.HASHMATCH_RUN_LLM_TESTS === "1";

describe.skipIf(!runLlmTests)("LLM integration (Ollama)", () => {
  const model = process.env.HASHMATCH_OLLAMA_TEST_MODEL ?? "qwen2.5:0.5b";

  it("runs a short Heist match with two LLM agents", async () => {
    const scenario = createHeistScenario();
    const adapter = getScenarioAdapter("heist");
    const agentA = createLlmAgent(
      "llm-a",
      { provider: "ollama", model, budget: resolveLlmBudgetConfig() },
      adapter,
    );
    const agentB = createLlmAgent(
      "llm-b",
      { provider: "ollama", model, budget: resolveLlmBudgetConfig() },
      adapter,
    );

    const result = await runMatch(scenario, [agentA, agentB], { seed: 7, maxTurns: 2 });
    const ended = result.events.find((event) => event.type === "MatchEnded");
    expect(ended).toBeDefined();
  });

  it("runs a short ResourceRivals match with two LLM agents", async () => {
    const scenario = createResourceRivalsScenario();
    const adapter = getScenarioAdapter("resourceRivals");
    const agentA = createLlmAgent(
      "llm-a",
      { provider: "ollama", model, budget: resolveLlmBudgetConfig() },
      adapter,
    );
    const agentB = createLlmAgent(
      "llm-b",
      { provider: "ollama", model, budget: resolveLlmBudgetConfig() },
      adapter,
    );

    const result = await runMatch(scenario, [agentA, agentB], { seed: 9, maxTurns: 2 });
    const ended = result.events.find((event) => event.type === "MatchEnded");
    expect(ended).toBeDefined();
  });

  it("emits fallback when the model outputs malformed text", async () => {
    const scenario = createResourceRivalsScenario();
    const actionSchema = z.object({ bid: z.number().int().min(0) });
    const adapter = {
      systemPrompt:
        "Reply with the word BANANA and do not include JSON. Do not use punctuation.",
      formatObservation: (observation: unknown) => JSON.stringify(observation),
      parseResponse: (text: string, _obs: unknown, context?: { truncated?: boolean }) => {
        const fallback = scenario.getDefaultAction();
        const result = decodeAgentAction(text, actionSchema, fallback);
        const chosenAction = (result.action ?? result.fallbackAction ?? fallback) as Record<
          string,
          unknown
        >;
        return attachActionForensics({ ...chosenAction }, {
          rawText: text,
          rawSha256: result.rawSha256,
          rawBytes: Buffer.byteLength(text, "utf-8"),
          truncated: context?.truncated ?? false,
          method: result.method,
          warnings: result.warnings,
          errors: result.errors,
          fallbackReason: result.fallbackReason,
          candidateAction: result.candidate,
          chosenAction,
          adjudicationPath: result.fallbackReason ? "fallback" : "text+tolerant_decode",
        });
      },
      fallbackAction: scenario.getDefaultAction(),
    };

    const agent = createLlmAgent(
      "llm-a",
      { provider: "ollama", model, budget: resolveLlmBudgetConfig() },
      adapter,
    );

    const result = await runMatch(scenario, [agent], { seed: 11, maxTurns: 1 });
    const adjudicated = result.events.find((event) => event.type === "ActionAdjudicated");
    expect(adjudicated).toBeDefined();
    if (adjudicated && adjudicated.type === "ActionAdjudicated") {
      expect(adjudicated.fallbackReason).toBeTruthy();
    }
  });
});
