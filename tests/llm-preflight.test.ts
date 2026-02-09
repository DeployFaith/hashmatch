import { describe, expect, it } from "vitest";
import { LlmPreflightError, preflightValidateLlmAgents } from "../src/agents/llm/preflight.js";

describe("LLM preflight validation", () => {
  it("fails when OpenRouter key is missing", async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      await expect(
        preflightValidateLlmAgents([
          {
            kind: "llm",
            provider: "openrouter",
            model: "gpt-4o-mini",
            purpose: "competitive",
          },
        ]),
      ).rejects.toThrow(LlmPreflightError);
    } finally {
      if (originalKey !== undefined) {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
    }
  });
});
