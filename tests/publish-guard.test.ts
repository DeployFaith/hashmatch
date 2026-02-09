import { describe, expect, it } from "vitest";
import { assertPublishableAgents } from "../src/tournament/publishGuard.js";

describe("publish guard", () => {
  it("allows competitive LLM agents", () => {
    expect(() => {
      assertPublishableAgents(["llm:ollama:qwen2.5:3b", "llm:openrouter:gpt-4o-mini"]);
    }).not.toThrow();
  });

  it("rejects test-purpose LLM agents", () => {
    expect(() => {
      assertPublishableAgents(["llm:ollama:qwen2.5:3b:test"]);
    }).toThrow(/Publish blocked/);
  });

  it("rejects non-LLM agents", () => {
    expect(() => {
      assertPublishableAgents(["random", "baseline"]);
    }).toThrow(/Publish blocked/);
  });
});
