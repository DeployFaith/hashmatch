import { CanonicalEventSchema, CanonicalUnknownEventSchema, normalizeJsonlLine } from "./event.js";

export interface JsonlValidationOptions {
  allowUnknown?: boolean;
}

export interface JsonlValidationError {
  line: number;
  message: string;
}

export interface JsonlValidationResult {
  totalLines: number;
  validLines: number;
  invalidLines: number;
  typeCounts: Record<string, number>;
  errors: JsonlValidationError[];
}

export function validateJsonlText(
  text: string,
  options: JsonlValidationOptions = {},
): JsonlValidationResult {
  const lines = text.split(/\r?\n/);
  const typeCounts: Record<string, number> = {};
  const errors: JsonlValidationError[] = [];
  let validLines = 0;
  let invalidLines = 0;
  let totalLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      continue;
    }

    totalLines += 1;
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      errors.push({ line: i + 1, message: "Invalid JSON" });
      invalidLines += 1;
      continue;
    }

    const normalized = normalizeJsonlLine(parsed, i + 1);
    if (normalized.type === "unknown" && !options.allowUnknown) {
      errors.push({ line: i + 1, message: "Unknown or invalid event" });
      invalidLines += 1;
      continue;
    }

    const schema =
      normalized.type === "unknown" ? CanonicalUnknownEventSchema : CanonicalEventSchema;
    const result = schema.safeParse(normalized);
    if (!result.success) {
      errors.push({
        line: i + 1,
        message: result.error.issues[0]?.message ?? "Validation failed",
      });
      invalidLines += 1;
      continue;
    }

    typeCounts[normalized.type] = (typeCounts[normalized.type] ?? 0) + 1;
    validLines += 1;
  }

  return {
    totalLines,
    validLines,
    invalidLines,
    typeCounts,
    errors,
  };
}
