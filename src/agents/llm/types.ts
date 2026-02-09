export type LlmProvider = "ollama" | "openrouter";
export type AgentPurpose = "competitive" | "test";

export interface LlmAgentDescriptor {
  kind: "llm";
  provider: LlmProvider;
  model: string;
  purpose: AgentPurpose;
}
