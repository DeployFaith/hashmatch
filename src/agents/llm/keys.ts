import type { AgentPurpose, LlmAgentDescriptor, LlmProvider } from "./types.js";

export function parseLlmAgentKey(key: string): LlmAgentDescriptor {
  if (!key.startsWith("llm:")) {
    throw new Error(
      `Invalid LLM agent key "${key}". Use format llm:<provider>:<model>[:<purpose>] (example: llm:ollama:qwen2.5:3b or llm:ollama:qwen2.5:3b:test).`,
    );
  }
  const rest = key.slice(4);
  const tokens = rest.split(":");
  if (tokens.length < 2) {
    throw new Error(
      `Invalid LLM agent key "${key}". Use format llm:<provider>:<model>[:<purpose>] (example: llm:ollama:qwen2.5:3b or llm:ollama:qwen2.5:3b:test).`,
    );
  }
  const provider = tokens[0] as LlmProvider;
  const lastToken = tokens[tokens.length - 1];
  const purpose: AgentPurpose =
    lastToken === "test" || lastToken === "competitive" ? lastToken : "competitive";
  const modelTokens = purpose === "competitive" ? tokens.slice(1) : tokens.slice(1, -1);
  const model = modelTokens.join(":");
  if (!provider || !model) {
    throw new Error(
      `Invalid LLM agent key "${key}". Use format llm:<provider>:<model>[:<purpose>] (example: llm:ollama:qwen2.5:3b or llm:ollama:qwen2.5:3b:test).`,
    );
  }
  return {
    kind: "llm",
    provider,
    model,
    purpose,
  };
}
