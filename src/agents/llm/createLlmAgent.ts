import type { Agent, AgentConfig, AgentContext } from "../../contract/interfaces.js";
import type { AgentId } from "../../contract/types.js";
import { sha256Hex } from "../../core/hash.js";
import {
  attachActionForensics,
  type LlmBudgetTelemetry,
  type LlmUsageMetrics,
} from "../../core/agentActionMetadata.js";
import type { ScenarioAdapter } from "../ollama/createOllamaAgent.js";
import { generatePlainText, generateStructured } from "./client.js";
import type { LlmBudgetConfig } from "./budget.js";
import type { LlmProvider } from "./types.js";

export interface LlmAgentRuntimeConfig {
  provider: LlmProvider;
  model: string;
  temperature?: number;
  baseUrl?: string;
  apiKey?: string;
  budget: LlmBudgetConfig;
}

function toUsageMetrics(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }):
  | LlmUsageMetrics
  | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function buildBudgetTelemetry(
  budget: LlmBudgetConfig,
  tokensUsed: number | null,
  matchTokensUsed: number | null,
  callsUsed: number,
  matchCallsUsed: number,
  outputTruncated: boolean,
): LlmBudgetTelemetry {
  const tokenCapHit =
    tokensUsed !== null
      ? tokensUsed > budget.maxTokensPerTurn ||
        (matchTokensUsed !== null && matchTokensUsed >= budget.maxTokensPerMatch)
      : false;
  const callCapHit = callsUsed > budget.maxCallsPerTurn || matchCallsUsed >= budget.maxCallsPerMatch;
  return {
    tokensUsed,
    tokensAllowed: budget.maxTokensPerTurn,
    matchTokensUsed,
    matchTokensAllowed: budget.maxTokensPerMatch,
    callsUsed,
    callsAllowed: budget.maxCallsPerTurn,
    matchCallsUsed,
    matchCallsAllowed: budget.maxCallsPerMatch,
    outputTruncated,
    tokenCapHit,
    callCapHit,
  };
}

export function createLlmAgent(
  name: string,
  config: LlmAgentRuntimeConfig,
  adapter: ScenarioAdapter,
): Agent<unknown, Record<string, unknown>> {
  let callsUsedMatch = 0;
  let tokensUsedMatch = 0;

  return {
    id: name as AgentId,
    init(_config: AgentConfig): void {
      // Stateless.
    },
    async act(observation: unknown, _ctx: AgentContext): Promise<Record<string, unknown>> {
      const remainingCalls = config.budget.maxCallsPerMatch - callsUsedMatch;
      const remainingTokens = config.budget.maxTokensPerMatch - tokensUsedMatch;
      const perTurnTokens = config.budget.maxTokensPerTurn;
      const maxOutputTokens = Math.max(0, Math.min(perTurnTokens, remainingTokens));

      if (remainingCalls <= 0 || remainingTokens <= 0 || config.budget.maxCallsPerTurn <= 0) {
        const fallback = { ...adapter.fallbackAction };
        return attachActionForensics(fallback, {
          rawText: "",
          rawSha256: sha256Hex(Buffer.from("", "utf-8")),
          rawBytes: 0,
          truncated: false,
          method: "failed",
          warnings: ["LLM budget exhausted; fallback action applied."],
          errors: null,
          fallbackReason: remainingCalls <= 0 ? "call-budget-exceeded" : "token-budget-exceeded",
          candidateAction: null,
          chosenAction: fallback,
          provider: config.provider,
          model: config.model,
          latencyMs: 0,
          usage: undefined,
          adjudicationPath: "fallback",
          budget: buildBudgetTelemetry(
            config.budget,
            null,
            tokensUsedMatch,
            0,
            callsUsedMatch,
            false,
          ),
        });
      }

      const requestConfig = {
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        maxOutputTokens,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      };

      const system = adapter.systemPrompt;
      const prompt = adapter.formatObservation(observation);
      const start = Date.now();

      try {
        if (adapter.actionSchema) {
          const result = await generateStructured(requestConfig, {
            system,
            prompt,
            schema: adapter.actionSchema,
          });
          const latencyMs = Date.now() - start;
          const normalized = adapter.normalizeAction
            ? adapter.normalizeAction(result.object, observation)
            : { action: result.object as Record<string, unknown>, warnings: [] };
          const chosenAction = (normalized.action ?? adapter.fallbackAction) as Record<
            string,
            unknown
          >;
          const fallbackReason = normalized.action ? null : "normalization-failed";
          const warnings = normalized.warnings ?? [];

          const rawPayload = result.responseBody ?? result.object;
          const rawText = JSON.stringify(rawPayload);
          const rawBytes = Buffer.byteLength(rawText, "utf-8");
          const truncated = result.finishReason === "length";
          const usage = toUsageMetrics(result.usage ?? {});
          const tokensUsed = usage?.totalTokens ?? null;
          callsUsedMatch += 1;
          tokensUsedMatch += usage?.totalTokens ?? 0;
          const budgetTelemetry = buildBudgetTelemetry(
            config.budget,
            tokensUsed,
            tokensUsedMatch,
            1,
            callsUsedMatch,
            truncated,
          );

          return attachActionForensics({ ...chosenAction }, {
            rawText,
            rawSha256: sha256Hex(Buffer.from(rawText, "utf-8")),
            rawBytes,
            truncated,
            method: "direct-json",
            warnings,
            errors: null,
            fallbackReason,
            candidateAction: normalized.action ?? result.object,
            chosenAction,
            provider: config.provider,
            model: config.model,
            latencyMs,
            usage,
            adjudicationPath: fallbackReason ? "fallback" : "structured",
            budget: budgetTelemetry,
          });
        }
      } catch {
        // fallback to text generation
      }

      try {
        const textResult = await generatePlainText(requestConfig, { system, prompt });
        const latencyMs = Date.now() - start;
        const truncated = textResult.finishReason === "length";
        const usage = toUsageMetrics(textResult.usage ?? {});
        const tokensUsed = usage?.totalTokens ?? null;
        callsUsedMatch += 1;
        tokensUsedMatch += usage?.totalTokens ?? 0;
        const budgetTelemetry = buildBudgetTelemetry(
          config.budget,
          tokensUsed,
          tokensUsedMatch,
          1,
          callsUsedMatch,
          truncated,
        );

        return adapter.parseResponse(textResult.text, observation, {
          provider: config.provider,
          model: config.model,
          latencyMs,
          usage,
          truncated,
          budget: budgetTelemetry,
          responseBody: textResult.responseBody,
        });
      } catch {
        const fallback = { ...adapter.fallbackAction };
        return attachActionForensics(fallback, {
          rawText: "",
          rawSha256: sha256Hex(Buffer.from("", "utf-8")),
          rawBytes: 0,
          truncated: false,
          method: "failed",
          warnings: ["LLM request failed; fallback action applied."],
          errors: null,
          fallbackReason: "llm-request-failed",
          candidateAction: null,
          chosenAction: fallback,
          provider: config.provider,
          model: config.model,
          latencyMs: 0,
          usage: undefined,
          adjudicationPath: "fallback",
          budget: buildBudgetTelemetry(
            config.budget,
            null,
            tokensUsedMatch,
            0,
            callsUsedMatch,
            false,
          ),
        });
      }
    },
  };
}
