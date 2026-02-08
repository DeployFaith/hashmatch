import { describe, expect, it } from "vitest";
import { stableStringify, toStableJsonl } from "../src/core/json.js";

describe("stableStringify", () => {
  it("orders object keys deterministically", () => {
    const value = { b: 1, a: 2 };
    expect(stableStringify(value)).toBe('{"a":2,"b":1}');
  });

  it("rejects non-JSON values", () => {
    expect(() => stableStringify({ ok: true, nope: undefined })).toThrow("Invalid JSON value");
  });

  it("rejects non-finite numbers", () => {
    expect(() => stableStringify(NaN)).toThrow("non-finite number");
  });
});

describe("toStableJsonl", () => {
  it("serializes unknown inputs with a trailing newline", () => {
    const jsonl = toStableJsonl([{ b: 1, a: 2 }]);
    expect(jsonl).toBe('{"a":2,"b":1}\n');
  });
});
