import type { ZodIssue, ZodType } from "zod";
import { sha256Hex } from "./hash.js";

export interface DecodeResult<T> {
  ok: boolean;
  action: T | null;
  fallbackAction: T | null;
  method: NormalizationMethod;
  rawSha256: string;
  warnings: string[];
  errors: ZodIssue[] | null;
  fallbackReason: string | null;
}

export type NormalizationMethod =
  | "direct-json"
  | "fenced-json"
  | "fenced-other"
  | "brace-extract"
  | "unwrapped"
  | "failed";

export const DEFAULT_UNWRAP_PATHS = [
  ["action"],
  ["response", "action"],
  ["result"],
  ["output", "action"],
];

type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: string };

const tryParseJson = (text: string): JsonParseResult => {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "parse error" };
  }
};

const extractFencedContent = (
  text: string,
): { content: string; method: NormalizationMethod } | null => {
  const jsonFence = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence?.[1] !== undefined) {
    return { content: jsonFence[1].trim(), method: "fenced-json" };
  }
  const anyFence = text.match(/```\s*([\s\S]*?)```/i);
  if (anyFence?.[1] !== undefined) {
    return { content: anyFence[1].trim(), method: "fenced-other" };
  }
  return null;
};

const limitByBytes = (text: string, maxBytes: number): { text: string; truncated: boolean } => {
  const bytes = Buffer.from(text, "utf-8");
  if (bytes.length <= maxBytes) {
    return { text, truncated: false };
  }
  return { text: bytes.subarray(0, maxBytes).toString("utf-8"), truncated: true };
};

const extractBalancedBraces = (
  text: string,
  maxScanBytes: number,
  maxBraceDepth: number,
): { json: string | null; truncated: boolean; exceededDepth: boolean } => {
  const { text: scanText, truncated } = limitByBytes(text, maxScanBytes);
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < scanText.length; i += 1) {
    const ch = scanText[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        startIndex = i;
      }
      depth += 1;
      if (depth > maxBraceDepth) {
        return { json: null, truncated, exceededDepth: true };
      }
      continue;
    }
    if (ch === "}") {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        return { json: scanText.slice(startIndex, i + 1), truncated, exceededDepth: false };
      }
    }
  }
  return { json: null, truncated, exceededDepth: false };
};

const unwrapCandidate = (
  candidate: unknown,
  unwrapPaths: string[][],
): { value: unknown; path: string[] } | null => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  for (const path of unwrapPaths) {
    let cursor: unknown = candidate;
    let matched = true;
    for (const segment of path) {
      if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
        matched = false;
        break;
      }
      const record = cursor as Record<string, unknown>;
      if (!(segment in record)) {
        matched = false;
        break;
      }
      cursor = record[segment];
    }
    if (matched && cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
      return { value: cursor, path };
    }
  }
  return null;
};

export function decodeAgentAction<T>(
  rawText: string,
  schema: ZodType<T>,
  fallback: T,
  opts?: {
    unwrapPaths?: string[][];
    maxScanBytes?: number;
    maxBraceDepth?: number;
  },
): DecodeResult<T> {
  const warnings: string[] = [];
  const rawSha256 = sha256Hex(Buffer.from(rawText, "utf-8"));
  const trimmed = rawText.trim();
  const {
    unwrapPaths = DEFAULT_UNWRAP_PATHS,
    maxScanBytes = 10_000,
    maxBraceDepth = 8,
  } = opts ?? {};

  let method: NormalizationMethod = "direct-json";
  let candidateText = trimmed;

  const fenced = extractFencedContent(trimmed);
  if (fenced) {
    candidateText = fenced.content;
    method = fenced.method;
  }

  let parsed = tryParseJson(candidateText);
  if (!parsed.ok) {
    const braceResult = extractBalancedBraces(trimmed, maxScanBytes, maxBraceDepth);
    if (braceResult.truncated) {
      warnings.push("Input truncated during brace scan.");
    }
    if (braceResult.exceededDepth) {
      warnings.push("Brace scan exceeded max depth.");
    }
    if (braceResult.json) {
      method = "brace-extract";
      parsed = tryParseJson(braceResult.json);
    }
  }

  if (!parsed.ok) {
    return {
      ok: false,
      action: null,
      fallbackAction: fallback,
      method: "failed",
      rawSha256,
      warnings,
      errors: null,
      fallbackReason: "no-json-found",
    };
  }

  let candidate: unknown = parsed.value;
  const unwrapped = unwrapCandidate(candidate, unwrapPaths);
  if (unwrapped) {
    warnings.push(`Unwrapped candidate via ${unwrapped.path.join(".")}.`);
    candidate = unwrapped.value;
    method = "unwrapped";
  }

  const result = schema.safeParse(candidate);
  if (result.success) {
    return {
      ok: true,
      action: result.data,
      fallbackAction: null,
      method,
      rawSha256,
      warnings,
      errors: null,
      fallbackReason: null,
    };
  }

  return {
    ok: false,
    action: null,
    fallbackAction: fallback,
    method,
    rawSha256,
    warnings,
    errors: result.error.issues,
    fallbackReason: "schema-validation-failed",
  };
}
