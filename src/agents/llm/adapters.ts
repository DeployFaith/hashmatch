import { createNumberGuessScenario } from "../../scenarios/numberGuess/index.js";
import { createResourceRivalsScenario } from "../../scenarios/resourceRivals/index.js";
import type { ScenarioAdapter } from "../ollama/createOllamaAgent.js";
import { heistAdapter } from "../ollama/heistAdapter.js";

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

  parseResponse(text: string): Record<string, unknown> | null {
    return parseJsonFromText(text);
  },

  fallbackAction: { type: "noop" },
});

const adapters: Map<KnownScenarioKey, ScenarioAdapter> = new Map();

// Full adapter — Heist (already implemented)
adapters.set("heist", heistAdapter);

// Stub adapters — functional but minimal
const resourceRivalsDefaults = createResourceRivalsScenario().getDefaultAction();
const resourceRivalsStub: ScenarioAdapter = {
  ...stubAdapter("resourceRivals"),
  systemPrompt:
    "You are playing ResourceRivals, a bidding game. Each turn you must bid an amount from your remaining resources. Respond with ONLY a JSON object like: {\"type\": \"bid\", \"amount\": 10}. No explanation, no markdown.",
  fallbackAction: resourceRivalsDefaults,
};
adapters.set("resourceRivals", resourceRivalsStub);

const numberGuessDefaults = createNumberGuessScenario().getDefaultAction();
const numberGuessStub: ScenarioAdapter = {
  ...stubAdapter("numberGuess"),
  systemPrompt:
    "You are playing NumberGuess. Each turn you must guess a number. Respond with ONLY a JSON object like: {\"type\": \"guess\", \"value\": 50}. No explanation, no markdown.",
  fallbackAction: numberGuessDefaults,
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
