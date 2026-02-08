import type { Agent } from "../../contract/interfaces.js";
import type { AgentId, JsonValue } from "../../contract/types.js";
import type { HeistAction, HeistObservation } from "../../scenarios/heist/index.js";
import type { OllamaConfig } from "./ollamaClient.js";
import { createOllamaAgent } from "./createOllamaAgent.js";
import { heistAdapter } from "./heistAdapter.js";

const DEFAULT_MODEL = "qwen2.5:3b";
const DEFAULT_TEMPERATURE = 0.3;

function resolveTemperature(): { value: number; options?: Record<string, unknown> } {
  const raw = process.env.OLLAMA_TEMPERATURE;
  if (!raw || raw.trim().length === 0) {
    return { value: DEFAULT_TEMPERATURE };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { value: DEFAULT_TEMPERATURE };
  }
  return { value: parsed, options: { temperature: parsed } };
}

function resolveAllowTools(): boolean {
  const raw = process.env.HASHMATCH_ALLOW_TOOLS;
  if (!raw) {
    return false;
  }
  return raw === "1" || raw.toLowerCase() === "true";
}

export function buildOllamaHeistMetadata(modelOverride?: string): Record<string, JsonValue> {
  const model = modelOverride?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const temperature = resolveTemperature().value;
  return {
    toolsAllowed: resolveAllowTools(),
    nondeterministic: true,
    llmProvider: "ollama",
    model,
    temperature,
  };
}

export function createOllamaHeistAgent(id: AgentId): Agent<HeistObservation, HeistAction> {
  const model = process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const { options } = resolveTemperature();

  const config: OllamaConfig = {
    model,
    ...(options ? { options } : {}),
  };

  return createOllamaAgent(id, config, heistAdapter) as Agent<HeistObservation, HeistAction>;
}

export { createOllamaAgent } from "./createOllamaAgent.js";
export { ollamaChat } from "./ollamaClient.js";
