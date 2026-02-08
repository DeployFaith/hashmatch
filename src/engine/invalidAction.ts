import type { ZodIssue } from "zod";
import type { JsonValue } from "../contract/types.js";
import type { AgentActionForensics } from "../core/agentActionMetadata.js";

export interface InvalidActionDetails {
  reason: string;
  attemptedAction: Record<string, unknown> | null;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatZodIssue = (issue: ZodIssue): string => {
  if (issue.path.length === 0) {
    return issue.message;
  }
  return `${issue.path.join(".")}: ${issue.message}`;
};

const describeFallbackReason = (
  fallbackReason: string | null | undefined,
  errors: ZodIssue[] | null | undefined,
): string => {
  if (!fallbackReason) {
    return "Action rejected.";
  }
  if (fallbackReason === "no-json-found") {
    return "Decoder failed to find JSON in agent output.";
  }
  if (fallbackReason === "schema-validation-failed") {
    if (errors && errors.length > 0) {
      return `Action schema validation failed: ${formatZodIssue(errors[0])}`;
    }
    return "Action schema validation failed.";
  }
  if (fallbackReason === "normalization-failed") {
    return "Action normalization failed.";
  }
  return `Decoder fallback: ${fallbackReason}`;
};

const describeFeedback = (feedback: JsonValue): string | null => {
  if (!isPlainObject(feedback)) {
    return null;
  }
  const message = feedback.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  const error = feedback.error;
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return null;
};

const resolveAttemptedAction = (
  action: unknown,
  forensics: AgentActionForensics<Record<string, unknown>> | null,
): Record<string, unknown> | null => {
  if (forensics?.fallbackReason === "no-json-found") {
    return null;
  }
  const candidate = forensics?.candidateAction;
  if (isPlainObject(candidate)) {
    return candidate;
  }
  if (isPlainObject(action)) {
    return action;
  }
  return null;
};

export function buildInvalidActionDetails(
  action: unknown,
  forensics: AgentActionForensics<Record<string, unknown>> | null,
  adjudication: { valid: boolean; feedback: JsonValue },
): InvalidActionDetails | null {
  const fallbackReason = forensics?.fallbackReason;
  if (adjudication.valid && !fallbackReason) {
    return null;
  }

  const reason = adjudication.valid
    ? describeFallbackReason(fallbackReason, forensics?.errors)
    : describeFeedback(adjudication.feedback) ?? "Action rejected.";

  return {
    reason,
    attemptedAction: resolveAttemptedAction(action, forensics),
  };
}
