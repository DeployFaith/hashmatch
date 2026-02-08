import type { MatchRunnerConfig } from "../contract/interfaces.js";
import type { JsonValue } from "../contract/types.js";

const DEFAULT_MAX_TURN_TIME_MS = 30000;
const DEFAULT_MAX_CONSECUTIVE_TIMEOUTS = 3;

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

export function resolveMaxTurnTimeMs(config: MatchRunnerConfig): number {
  const fromMode = readConfigNumber(config.modeProfile, "maxTurnTimeMs");
  const fromDivision = readConfigNumber(config.divisionConfig, "maxTurnTimeMs");
  const fromOverride = resolveNumber(config.maxTurnTimeMs);
  return (
    fromMode ??
    fromDivision ??
    fromOverride ??
    DEFAULT_MAX_TURN_TIME_MS
  );
}

export function resolveMaxConsecutiveTimeouts(config: MatchRunnerConfig): number {
  const fromMode = readConfigNumber(config.modeProfile, "maxConsecutiveTimeouts");
  const fromDivision = readConfigNumber(config.divisionConfig, "maxConsecutiveTimeouts");
  const fromOverride = resolveNumber(config.maxConsecutiveTimeouts);
  return (
    fromMode ??
    fromDivision ??
    fromOverride ??
    DEFAULT_MAX_CONSECUTIVE_TIMEOUTS
  );
}
