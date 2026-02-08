import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eventSortKey, normalizeJsonlLine, validateJsonlText } from "../src/lib/replay/index.js";

function compareSortKey(a: ReturnType<typeof eventSortKey>, b: ReturnType<typeof eventSortKey>) {
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      continue;
    }
    return left < right ? -1 : 1;
  }
  return 0;
}

describe("normalizeJsonlLine", () => {
  it("accepts common fields for known events", () => {
    const normalized = normalizeJsonlLine(
      {
        type: "ActionSubmitted",
        seq: 12,
        matchId: "m-1",
        turn: 3,
        agentId: "agent-9",
        payload: { guess: 4 },
        details: { meta: true },
      },
      7,
    );

    expect(normalized).toEqual({
      type: "ActionSubmitted",
      seq: 12,
      matchId: "m-1",
      turn: 3,
      agentId: "agent-9",
      payload: { guess: 4 },
      details: { meta: true },
      lineNo: 7,
    });
  });

  it("wraps unknown or invalid input as type: unknown", () => {
    const normalized = normalizeJsonlLine("not an object", 1);
    expect(normalized).toEqual({
      type: "unknown",
      raw: "not an object",
      lineNo: 1,
    });

    const missingType = normalizeJsonlLine({ seq: 1, matchId: "m-1" }, 2);
    expect(missingType.type).toBe("unknown");
  });
});

describe("eventSortKey", () => {
  it("prefers seq ordering and falls back to turn/agentId/type/lineNo", () => {
    const events = [
      normalizeJsonlLine({ type: "Event", turn: 2, agentId: "b" }, 2),
      normalizeJsonlLine({ type: "Event", turn: 1, agentId: "a" }, 3),
      normalizeJsonlLine({ type: "Event", turn: 1, agentId: "a" }, 4),
      normalizeJsonlLine({ type: "Event", turn: 1, agentId: "b" }, 5),
      normalizeJsonlLine({ type: "MatchStarted", seq: 5, matchId: "m" }, 10),
    ];

    const sorted = [...events].sort((left, right) =>
      compareSortKey(eventSortKey(left), eventSortKey(right)),
    );

    expect(sorted[0].seq).toBe(5);
    expect(sorted.slice(1).map((event) => event.lineNo)).toEqual([3, 4, 5, 2]);
  });
});

describe("sample replay JSONL", () => {
  it("validates without errors", () => {
    const sample = readFileSync("public/samples/sample.match.jsonl", "utf-8");
    const result = validateJsonlText(sample);

    expect(result.invalidLines).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.typeCounts.MatchStarted).toBe(1);
  });
});
