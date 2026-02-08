import type { ZodIssue } from "zod";
import type { NormalizationMethod } from "./decodeAgentAction.js";

export interface AgentActionForensics<TAction> {
  rawText: string;
  rawSha256: string;
  rawBytes: number;
  truncated: boolean;
  method: NormalizationMethod;
  warnings: string[];
  errors: ZodIssue[] | null;
  fallbackReason: string | null;
  chosenAction: TAction;
}

const ACTION_FORENSICS_SYMBOL = Symbol("hashmatch.actionForensics");

export function attachActionForensics<TAction extends Record<string, unknown>>(
  action: TAction,
  forensics: AgentActionForensics<TAction>,
): TAction {
  Object.defineProperty(action, ACTION_FORENSICS_SYMBOL, {
    value: forensics,
    enumerable: false,
  });
  return action;
}

export function getActionForensics(
  action: unknown,
): AgentActionForensics<Record<string, unknown>> | null {
  if (!action || typeof action !== "object") {
    return null;
  }
  const record = action as Record<string | symbol, unknown>;
  const forensics = record[ACTION_FORENSICS_SYMBOL];
  if (!forensics || typeof forensics !== "object") {
    return null;
  }
  return forensics as AgentActionForensics<Record<string, unknown>>;
}
