import { describe, expect, it, vi } from "vitest";
import { createNumberGuessScenario } from "../src/scenarios/numberGuess/index.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createLlmAgent } from "../src/agents/llm/createLlmAgent.js";
import { resolveLlmBudgetConfig } from "../src/agents/llm/budget.js";
import { getScenarioAdapter } from "../src/agents/llm/adapters.js";
import * as llmClient from "../src/agents/llm/client.js";

describe("LLM adjudication paths", () => {
  it("labels structured path when generateObject succeeds", async () => {
    vi.spyOn(llmClient, "generateStructured").mockResolvedValue({
      object: { type: "guess", value: 5 },
      usage: {
        inputTokens: 5,
        inputTokenDetails: { noCacheTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokens: 5,
        outputTokenDetails: { textTokens: 5, reasoningTokens: 0 },
        totalTokens: 10,
      },
      finishReason: "stop",
      responseBody: { mock: true },
    });

    const adapter = getScenarioAdapter("numberGuess");
    const agent = createLlmAgent(
      "llm-0",
      {
        provider: "ollama",
        model: "test",
        budget: resolveLlmBudgetConfig(),
      },
      adapter,
    );

    const result = await runMatch(createNumberGuessScenario(), [agent], {
      seed: 1,
      maxTurns: 1,
    });

    const rawOutput = result.events.find((event) => event.type === "AgentRawOutput");
    expect(rawOutput).toBeDefined();
    if (rawOutput && rawOutput.type === "AgentRawOutput") {
      expect(rawOutput.adjudicationPath).toBe("structured");
    }
  });

  it("labels fallback path when tolerant decoding fails", async () => {
    vi.spyOn(llmClient, "generateStructured").mockImplementation(async () => {
      throw new Error("force text fallback");
    });
    vi.spyOn(llmClient, "generatePlainText").mockResolvedValue({
      text: "garbage response",
      usage: {
        inputTokens: 3,
        inputTokenDetails: { noCacheTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokens: 3,
        outputTokenDetails: { textTokens: 3, reasoningTokens: 0 },
        totalTokens: 6,
      },
      finishReason: "stop",
      responseBody: { mock: true },
    });

    const adapter = getScenarioAdapter("numberGuess");
    const agent = createLlmAgent(
      "llm-1",
      {
        provider: "ollama",
        model: "test",
        budget: resolveLlmBudgetConfig(),
      },
      adapter,
    );

    const result = await runMatch(createNumberGuessScenario(), [agent], {
      seed: 2,
      maxTurns: 1,
    });

    const rawOutput = result.events.find((event) => event.type === "AgentRawOutput");
    expect(rawOutput).toBeDefined();
    if (rawOutput && rawOutput.type === "AgentRawOutput") {
      expect(rawOutput.adjudicationPath).toBe("fallback");
    }
  });
});
