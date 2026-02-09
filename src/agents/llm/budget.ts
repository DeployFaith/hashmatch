import type { JsonValue } from "../../contract/types.js";

export interface LlmBudgetConfig {
  maxTokensPerTurn: number;
  maxTokensPerMatch: number;
  maxCallsPerTurn: number;
  maxCallsPerMatch: number;
}

const DEFAULT_BUDGET: LlmBudgetConfig = {
  maxTokensPerTurn: 1024,
  maxTokensPerMatch: 16384,
  maxCallsPerTurn: 1,
  maxCallsPerMatch: 128,
};

function resolveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  if (normalized <= 0) {
    return undefined;
  }
  return normalized;
}

function readConfigNumber(source: JsonValue | undefined, key: string): number | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }
  const record = source as Record<string, unknown>;
  return resolveNumber(record[key]);
}

export function resolveLlmBudgetConfig(
  modeProfile?: JsonValue,
  divisionConfig?: JsonValue,
): LlmBudgetConfig {
  const maxTokensPerTurn =
    readConfigNumber(modeProfile, "maxTokensPerTurn") ??
    readConfigNumber(divisionConfig, "maxTokensPerTurn") ??
    DEFAULT_BUDGET.maxTokensPerTurn;
  const maxTokensPerMatch =
    readConfigNumber(modeProfile, "maxTokensPerMatch") ??
    readConfigNumber(divisionConfig, "maxTokensPerMatch") ??
    DEFAULT_BUDGET.maxTokensPerMatch;
  const maxCallsPerTurn =
    readConfigNumber(modeProfile, "maxCallsPerTurn") ??
    readConfigNumber(divisionConfig, "maxCallsPerTurn") ??
    DEFAULT_BUDGET.maxCallsPerTurn;
  const maxCallsPerMatch =
    readConfigNumber(modeProfile, "maxCallsPerMatch") ??
    readConfigNumber(divisionConfig, "maxCallsPerMatch") ??
    DEFAULT_BUDGET.maxCallsPerMatch;

  return {
    maxTokensPerTurn,
    maxTokensPerMatch,
    maxCallsPerTurn,
    maxCallsPerMatch,
  };
}
