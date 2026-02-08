import type { Agent, AgentConfig, AgentContext } from "../../contract/interfaces.js";
import type { AgentId } from "../../contract/types.js";
import type { OllamaChatMessage, OllamaConfig } from "./ollamaClient.js";
import { ollamaChat } from "./ollamaClient.js";

export interface ScenarioAdapter {
  systemPrompt: string;
  formatObservation(observation: unknown): string;
  parseResponse(text: string, observation: unknown): Record<string, unknown> | null;
  fallbackAction: Record<string, unknown>;
}

function shouldAllowTools(): boolean {
  const raw = process.env.HASHMATCH_ALLOW_TOOLS;
  if (!raw) {
    return false;
  }
  return raw === "1" || raw.toLowerCase() === "true";
}

function hasOnlyFiniteNumbers(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((entry) => hasOnlyFiniteNumbers(entry));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((entry) =>
      hasOnlyFiniteNumbers(entry),
    );
  }
  return true;
}

export function createOllamaAgent(
  name: string,
  ollamaConfig: OllamaConfig,
  adapter: ScenarioAdapter,
): Agent<unknown, Record<string, unknown>> {
  let warnedUnreachable = false;

  return {
    id: name as AgentId,
    init(_config: AgentConfig): void {
      // Stateless.
    },
    async act(observation: unknown, _ctx: AgentContext): Promise<Record<string, unknown>> {
      if (!shouldAllowTools()) {
        return adapter.fallbackAction;
      }

      const systemMessage: OllamaChatMessage = {
        role: "system",
        content: adapter.systemPrompt,
      };
      const userMessage: OllamaChatMessage = {
        role: "user",
        content: adapter.formatObservation(observation),
      };

      const response = await ollamaChat(ollamaConfig, [systemMessage, userMessage]);

      if (process.env.HASHMATCH_OLLAMA_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.error(
          `[ollama-debug] raw response (${response.length} chars): ${response.slice(0, 500)}`,
        );
      }

      if (!warnedUnreachable && response.startsWith("ERROR: Ollama unreachable")) {
        warnedUnreachable = true;
        // eslint-disable-next-line no-console
        console.warn(`[ollama] ${response}. Falling back to safe actions.`);
      }

      const parsed = adapter.parseResponse(response, observation);

      if (process.env.HASHMATCH_OLLAMA_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.error(`[ollama-debug] parsed result: ${JSON.stringify(parsed)}`);
      }

      const action = parsed ?? adapter.fallbackAction;
      if (!hasOnlyFiniteNumbers(action)) {
        return adapter.fallbackAction;
      }
      return action;
    },
  };
}
