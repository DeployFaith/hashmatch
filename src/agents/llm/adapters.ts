import { z } from "zod";
import { createNumberGuessScenario } from "../../scenarios/numberGuess/index.js";
import { createResourceRivalsScenario } from "../../scenarios/resourceRivals/index.js";
import type { ScenarioAdapter } from "../ollama/createOllamaAgent.js";
import { heistAdapter } from "../ollama/heistAdapter.js";
import { DEFAULT_UNWRAP_PATHS, decodeAgentAction } from "../../core/decodeAgentAction.js";
import { attachActionForensics } from "../../core/agentActionMetadata.js";
import { sha256Hex } from "../../core/hash.js";

const KNOWN_SCENARIOS = ["heist", "numberGuess", "resourceRivals"] as const;
type KnownScenarioKey = (typeof KNOWN_SCENARIOS)[number];

const scenarioNames: Record<KnownScenarioKey, string> = {
  heist: "Heist",
  numberGuess: "NumberGuess",
  resourceRivals: "ResourceRivals",
};

function normalizeScenarioKey(scenario: string): KnownScenarioKey {
  if ((KNOWN_SCENARIOS as readonly string[]).includes(scenario)) {
    return scenario as KnownScenarioKey;
  }

  const normalized = scenario.toLowerCase();
  const match = KNOWN_SCENARIOS.find((key) => key.toLowerCase() === normalized);
  if (!match) {
    throw new Error(
      `No LLM adapter for scenario "${scenario}". Available: ${KNOWN_SCENARIOS.join(", ")}`,
    );
  }
  return match;
}

function parseJsonFromText(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const stubAdapter = (scenarioKey: KnownScenarioKey): ScenarioAdapter => ({
  systemPrompt: `You are playing a game called "${scenarioNames[scenarioKey]}". Respond with valid JSON actions. If unsure, respond with: {}`,

  formatObservation(observation: unknown): string {
    return JSON.stringify(observation, null, 2);
  },

  parseResponse(text: string, _observation: unknown, context): Record<string, unknown> {
    const rawText = typeof text === "string" ? text : "";
    const parsed = parseJsonFromText(rawText);
    const fallback = { type: "noop" };
    const chosenAction = (parsed ?? fallback) as Record<string, unknown>;
    const rawBytes = Buffer.byteLength(rawText, "utf-8");
    return attachActionForensics({ ...chosenAction }, {
      rawText,
      rawSha256: sha256Hex(Buffer.from(rawText, "utf-8")),
      rawBytes,
      truncated: context?.truncated ?? false,
      method: parsed ? "direct-json" : "failed",
      warnings: parsed ? [] : ["Failed to parse JSON response."],
      errors: null,
      fallbackReason: parsed ? null : "no-json-found",
      candidateAction: parsed,
      chosenAction,
      provider: context?.provider,
      model: context?.model,
      latencyMs: context?.latencyMs,
      usage: context?.usage,
      adjudicationPath: parsed ? "text+tolerant_decode" : "fallback",
      budget: context?.budget,
    });
  },

  fallbackAction: { type: "noop" },
});

const adapters: Map<KnownScenarioKey, ScenarioAdapter> = new Map();

// Full adapter — Heist (already implemented)
adapters.set("heist", heistAdapter);

// Stub adapters — functional but minimal
const resourceRivalsDefaults = createResourceRivalsScenario().getDefaultAction();
const resourceRivalsActionSchema = z.union([
  z.object({ bid: z.number().int().min(0) }),
  z.object({ type: z.literal("bid"), amount: z.number().int().min(0) }),
]);
const resourceRivalsStub: ScenarioAdapter = {
  ...stubAdapter("resourceRivals"),
  systemPrompt:
    "You are playing ResourceRivals, a bidding game. Each turn you must bid an amount from your remaining resources. Respond with ONLY a JSON object like: {\"type\": \"bid\", \"amount\": 10}. No explanation, no markdown.",
  fallbackAction: resourceRivalsDefaults,
  actionSchema: resourceRivalsActionSchema,
  normalizeAction: (action: unknown) => {
    const parsed = resourceRivalsActionSchema.safeParse(action);
    if (!parsed.success) {
      return { action: null, warnings: ["Structured action failed schema validation."] };
    }
    const value =
      "bid" in parsed.data ? parsed.data.bid : (parsed.data.amount as number | undefined);
    if (value === undefined) {
      return { action: null, warnings: ["Structured action normalization failed."] };
    }
    return { action: { bid: value }, warnings: [] };
  },
  parseResponse(text: string, _observation: unknown, context): Record<string, unknown> {
    const rawText = typeof text === "string" ? text : "";
    const result = decodeAgentAction(rawText, resourceRivalsActionSchema, resourceRivalsDefaults, {
      unwrapPaths: [...DEFAULT_UNWRAP_PATHS, ["response"]],
    });
    const warnings = [...result.warnings];
    let fallbackReason = result.fallbackReason;
    let normalizedAction: { bid: number } | null = null;
    if (result.action) {
      const value =
        "bid" in result.action
          ? (result.action as { bid?: number }).bid
          : (result.action as { amount?: number }).amount;
      if (typeof value === "number") {
        normalizedAction = { bid: value };
      } else {
        warnings.push("Action normalization failed.");
        fallbackReason ??= "normalization-failed";
      }
    }
    const chosenAction =
      (normalizedAction ?? result.fallbackAction ?? resourceRivalsDefaults) as Record<
        string,
        unknown
      >;
    const rawBytes = Buffer.byteLength(rawText, "utf-8");
    const adjudicationPath = fallbackReason ? "fallback" : "text+tolerant_decode";
    return attachActionForensics({ ...chosenAction }, {
      rawText,
      rawSha256: result.rawSha256,
      rawBytes,
      truncated: context?.truncated ?? false,
      method: result.method,
      warnings,
      errors: result.errors,
      fallbackReason,
      candidateAction: result.candidate,
      chosenAction,
      provider: context?.provider,
      model: context?.model,
      latencyMs: context?.latencyMs,
      usage: context?.usage,
      adjudicationPath,
      budget: context?.budget,
    });
  },
};
adapters.set("resourceRivals", resourceRivalsStub);

const numberGuessDefaults = createNumberGuessScenario().getDefaultAction();
const numberGuessActionSchema = z.union([
  z.object({ guess: z.number().int() }),
  z.object({ type: z.literal("guess"), value: z.number().int() }),
]);
const numberGuessStub: ScenarioAdapter = {
  ...stubAdapter("numberGuess"),
  systemPrompt:
    "You are playing NumberGuess. Each turn you must guess a number. Respond with ONLY a JSON object like: {\"type\": \"guess\", \"value\": 50}. No explanation, no markdown.",
  fallbackAction: numberGuessDefaults,
  actionSchema: numberGuessActionSchema,
  normalizeAction: (action: unknown) => {
    const parsed = numberGuessActionSchema.safeParse(action);
    if (!parsed.success) {
      return { action: null, warnings: ["Structured action failed schema validation."] };
    }
    const value =
      "guess" in parsed.data ? parsed.data.guess : (parsed.data.value as number | undefined);
    if (value === undefined) {
      return { action: null, warnings: ["Structured action normalization failed."] };
    }
    return { action: { guess: value }, warnings: [] };
  },
  parseResponse(text: string, _observation: unknown, context): Record<string, unknown> {
    const rawText = typeof text === "string" ? text : "";
    const result = decodeAgentAction(rawText, numberGuessActionSchema, numberGuessDefaults, {
      unwrapPaths: [...DEFAULT_UNWRAP_PATHS, ["response"]],
    });
    const warnings = [...result.warnings];
    let fallbackReason = result.fallbackReason;
    let normalizedAction: { guess: number } | null = null;
    if (result.action) {
      const value =
        "guess" in result.action
          ? (result.action as { guess?: number }).guess
          : (result.action as { value?: number }).value;
      if (typeof value === "number") {
        normalizedAction = { guess: value };
      } else {
        warnings.push("Action normalization failed.");
        fallbackReason ??= "normalization-failed";
      }
    }
    const chosenAction =
      (normalizedAction ?? result.fallbackAction ?? numberGuessDefaults) as Record<
        string,
        unknown
      >;
    const rawBytes = Buffer.byteLength(rawText, "utf-8");
    const adjudicationPath = fallbackReason ? "fallback" : "text+tolerant_decode";
    return attachActionForensics({ ...chosenAction }, {
      rawText,
      rawSha256: result.rawSha256,
      rawBytes,
      truncated: context?.truncated ?? false,
      method: result.method,
      warnings,
      errors: result.errors,
      fallbackReason,
      candidateAction: result.candidate,
      chosenAction,
      provider: context?.provider,
      model: context?.model,
      latencyMs: context?.latencyMs,
      usage: context?.usage,
      adjudicationPath,
      budget: context?.budget,
    });
  },
};
adapters.set("numberGuess", numberGuessStub);

const stubWarnings = new Set<KnownScenarioKey>();
const stubScenarios = new Set<KnownScenarioKey>(["resourceRivals", "numberGuess"]);

export function getScenarioAdapter(scenario: string): ScenarioAdapter {
  const normalizedScenario = normalizeScenarioKey(scenario);
  const adapter = adapters.get(normalizedScenario);
  if (!adapter) {
    throw new Error(
      `No LLM adapter for scenario "${scenario}". Available: ${KNOWN_SCENARIOS.join(", ")}`,
    );
  }

  if (stubScenarios.has(normalizedScenario) && !stubWarnings.has(normalizedScenario)) {
    stubWarnings.add(normalizedScenario);
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️  LLM adapter for "${normalizedScenario}" is a stub — agent will likely underperform. Full adapter support coming soon.`,
    );
  }

  return adapter;
}
