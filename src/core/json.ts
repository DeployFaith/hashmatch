import type { JsonValue } from "../contract/types.js";

function assertJsonValue(value: unknown, path = "$"): asserts value is JsonValue {
  if (value === null) {
    return;
  }

  const type = typeof value;
  if (type === "string" || type === "boolean") {
    return;
  }

  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid JSON value at ${path}: non-finite number`);
    }
    return;
  }

  if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") {
    throw new Error(`Invalid JSON value at ${path}: ${type}`);
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertJsonValue(value[i], `${path}[${i}]`);
    }
    return;
  }

  if (type === "object") {
    const record = value as Record<string, unknown>;
    const proto = Object.getPrototypeOf(record);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`Invalid JSON object at ${path}: non-plain object`);
    }
    for (const [key, nested] of Object.entries(record)) {
      assertJsonValue(nested, `${path}.${key}`);
    }
    return;
  }

  throw new Error(`Invalid JSON value at ${path}: ${type}`);
}

function stableStringifyArray(values: JsonValue[]): string {
  const items = values.map((value) => stableStringifyValue(value));
  return `[${items.join(",")}]`;
}

function stableStringifyObject(value: Record<string, JsonValue>): string {
  const keys = Object.keys(value).sort();
  const items = keys.map((key) => {
    const encodedKey = JSON.stringify(key);
    const encodedValue = stableStringifyValue(value[key]);
    return `${encodedKey}:${encodedValue}`;
  });
  return `{${items.join(",")}}`;
}

function stableStringifyValue(value: JsonValue): string {
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

/**
 * Deterministic JSON serialization with stable key ordering.
 * Validates unknown input at runtime before serialization.
 */
export function stableStringify(value: unknown): string {
  assertJsonValue(value);
  return stableStringifyValue(value);
}

/** Render JSONL with stable serialization, always ending in a newline. */
export function toStableJsonl(values: unknown[]): string {
  return values.map((value) => stableStringify(value)).join("\n") + "\n";
}
