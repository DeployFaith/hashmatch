import { parseLlmAgentKey } from "../agents/llm/keys.js";

export function assertPublishableAgents(agentKeys: string[]): void {
  const blocked = agentKeys.filter((key) => {
    if (!key.startsWith("llm:")) {
      return true;
    }
    const descriptor = parseLlmAgentKey(key);
    return descriptor.purpose === "test";
  });

  if (blocked.length > 0) {
    throw new Error(
      `Publish blocked: test-purpose agents detected (${blocked.join(
        ", ",
      )}). Use competitive LLM agents to publish.`,
    );
  }
}
