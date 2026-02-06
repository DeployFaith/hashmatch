import type { JsonValue } from "../contract/types.js";

function stableStringifyArray(values: JsonValue[]): string {
  const items = values.map((value) => stableStringify(value));
  return `[${items.join(",")}]`;
}

function stableStringifyObject(value: Record<string, JsonValue>): string {
  const keys = Object.keys(value).sort();
  const items = keys.map((key) => {
    const encodedKey = JSON.stringify(key);
    const encodedValue = stableStringify(value[key]);
    return `${encodedKey}:${encodedValue}`;
  });
  return `{${items.join(",")}}`;
}

/**
 * Deterministic JSON serialization with stable key ordering.
 * Assumes the input is JsonValue (no undefined, NaN, or functions).
 */
export function stableStringify(value: JsonValue): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return stableStringifyArray(value);
  }

  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return JSON.stringify(value);
  }

  return stableStringifyObject(value as Record<string, JsonValue>);
}

/** Render JSONL with stable serialization, always ending in a newline. */
export function toStableJsonl(values: JsonValue[]): string {
  return values.map((value) => stableStringify(value)).join("\n") + "\n";
}
