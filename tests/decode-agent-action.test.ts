import { describe, expect, it } from "vitest";
import { z } from "zod";
import { decodeAgentAction } from "../src/core/decodeAgentAction.js";
import { sha256Hex } from "../src/core/hash.js";

type Action =
  | { type: "move"; toRoomId: string }
  | { type: "pickup"; itemId: string }
  | { type: "use_terminal"; terminalId: string }
  | { type: "extract" }
  | { type: "wait" };

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), toRoomId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pickup"), itemId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("use_terminal"), terminalId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("extract") }).strict(),
  z.object({ type: z.literal("wait") }).strict(),
]);

const fallback: Action = { type: "wait" };

describe("decodeAgentAction", () => {
  it("parses direct JSON", () => {
    const result = decodeAgentAction("{\"type\":\"wait\"}", ActionSchema, fallback);
    expect(result.ok).toBe(true);
    expect(result.action).toEqual({ type: "wait" });
    expect(result.method).toBe("direct-json");
  });

  it("parses fenced JSON", () => {
    const raw = "```json\n{\"type\":\"wait\"}\n```";
    const result = decodeAgentAction(raw, ActionSchema, fallback);
    expect(result.ok).toBe(true);
    expect(result.action).toEqual({ type: "wait" });
    expect(result.method).toBe("fenced-json");
  });

  it("extracts JSON from prose", () => {
    const raw = "Here is the action: {\"type\":\"wait\"} thanks.";
    const result = decodeAgentAction(raw, ActionSchema, fallback);
    expect(result.ok).toBe(true);
    expect(result.action).toEqual({ type: "wait" });
    expect(result.method).toBe("brace-extract");
  });

  it("unwraps nested action objects", () => {
    const raw = "{\"action\":{\"type\":\"wait\"}}";
    const result = decodeAgentAction(raw, ActionSchema, fallback);
    expect(result.ok).toBe(true);
    expect(result.action).toEqual({ type: "wait" });
    expect(result.method).toBe("unwrapped");
  });

  it("falls back on invalid JSON", () => {
    const result = decodeAgentAction("{not json", ActionSchema, fallback);
    expect(result.ok).toBe(false);
    expect(result.fallbackAction).toEqual(fallback);
    expect(result.fallbackReason).toBe("no-json-found");
  });

  it("reports schema validation errors", () => {
    const result = decodeAgentAction("{\"type\":\"move\"}", ActionSchema, fallback);
    expect(result.ok).toBe(false);
    expect(result.fallbackAction).toEqual(fallback);
    expect(result.fallbackReason).toBe("schema-validation-failed");
    expect(result.errors).not.toBeNull();
  });

  it("handles empty string", () => {
    const result = decodeAgentAction("", ActionSchema, fallback);
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe("no-json-found");
  });

  it("respects max brace depth", () => {
    const raw = "prefix {{{{{{{{ not json }}}}}}}}";
    const result = decodeAgentAction(raw, ActionSchema, fallback, { maxBraceDepth: 2 });
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe("no-json-found");
  });

  it("respects max scan bytes", () => {
    const padding = "a".repeat(1200);
    const raw = `${padding}{\"type\":\"wait\"}`;
    const result = decodeAgentAction(raw, ActionSchema, fallback, { maxScanBytes: 1000 });
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe("no-json-found");
  });

  it("always hashes the raw input", () => {
    const raw = "  {\"type\":\"wait\"}  ";
    const result = decodeAgentAction(raw, ActionSchema, fallback);
    const expected = sha256Hex(Buffer.from(raw, "utf-8"));
    expect(result.rawSha256).toBe(expected);
  });
});
