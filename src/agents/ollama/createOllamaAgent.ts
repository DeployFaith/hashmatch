import type { Agent } from "../../contract/interfaces.js";
import type { ZodType } from "zod";
import type { OllamaConfig } from "./ollamaClient.js";
import { createLlmAgent } from "../llm/createLlmAgent.js";
import { resolveLlmBudgetConfig } from "../llm/budget.js";
import type { LlmBudgetTelemetry, LlmUsageMetrics } from "../../core/agentActionMetadata.js";

export interface ScenarioAdapter {
  systemPrompt: string;
  formatObservation(observation: unknown): string;
  parseResponse(
    text: string,
    observation: unknown,
    context?: {
      provider?: string;
      model?: string;
      latencyMs?: number;
      usage?: LlmUsageMetrics;
      truncated?: boolean;
      budget?: LlmBudgetTelemetry;
      responseBody?: unknown;
    },
  ): Record<string, unknown>;
  fallbackAction: Record<string, unknown>;
  actionSchema?: ZodType<unknown>;
  normalizeAction?: (
    action: unknown,
    observation?: unknown,
  ) => { action: Record<string, unknown> | null; warnings: string[] };
}

export function createOllamaAgent(
  name: string,
  ollamaConfig: OllamaConfig,
  adapter: ScenarioAdapter,
): Agent<unknown, Record<string, unknown>> {
  const endpoint = ollamaConfig.endpoint?.trim();
  const temperature =
    typeof ollamaConfig.options?.temperature === "number"
      ? ollamaConfig.options.temperature
      : undefined;
  return createLlmAgent(
    name,
    {
      provider: "ollama",
      model: ollamaConfig.model,
      temperature,
      baseUrl: endpoint ? `${endpoint.replace(/\/$/, "")}/v1` : "http://localhost:11434/v1",
      apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
      budget: resolveLlmBudgetConfig(),
    },
    adapter,
  ) as Agent<unknown, Record<string, unknown>>;
}
