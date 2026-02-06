import { describe, expect, it } from "vitest";
import {
  getVisibleCommentary,
  normalizeAndSortCommentary,
  parseCommentaryJson,
} from "../src/lib/replay/commentary.js";

const moments = [
  { id: "moment-1", startEventIdx: 3, endEventIdx: 5 },
  { id: "moment-2", startEventIdx: 6, endEventIdx: 8 },
];

describe("parseCommentaryJson", () => {
  it("parses valid moment-bound and range-bound entries", () => {
    const result = parseCommentaryJson({
      entries: [
        { momentId: "moment-1", text: "First moment", speaker: "caster" },
        { startEventIdx: 1, endEventIdx: 2, text: "Early range", tags: ["hype"] },
      ],
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].momentId).toBe("moment-1");
    expect(result.entries[1].startEventIdx).toBe(1);
  });

  it("ignores malformed entries and returns warnings", () => {
    const result = parseCommentaryJson({
      entries: [
        { text: 123 },
        "not-an-object",
        { startEventIdx: 1, endEventIdx: 2 },
      ],
    });

    expect(result.entries).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("normalizeAndSortCommentary", () => {
  it("produces deterministic ordering from the same input", () => {
    const parsed = parseCommentaryJson({
      entries: [
        { id: "b", startEventIdx: 1, endEventIdx: 1, text: "Second" },
        { id: "a", startEventIdx: 1, endEventIdx: 1, text: "First" },
        { startEventIdx: 1, endEventIdx: 1, text: "No id" },
      ],
    });

    const first = normalizeAndSortCommentary(parsed.entries, moments, 10);
    const second = normalizeAndSortCommentary(parsed.entries, moments, 10);

    expect(first).toEqual(second);
  });
});

describe("getVisibleCommentary", () => {
  it("gates future commentary until playhead reaches start", () => {
    const parsed = parseCommentaryJson({
      entries: [
        { momentId: "moment-1", text: "Moment entry" },
        { startEventIdx: 1, endEventIdx: 1, text: "Range entry" },
      ],
    });
    const normalized = normalizeAndSortCommentary(parsed.entries, moments, 10);

    const before = getVisibleCommentary({
      entries: normalized,
      moments,
      playheadIdx: 0,
      revealSpoilers: false,
    });
    expect(before.visibleNow).toHaveLength(0);

    const mid = getVisibleCommentary({
      entries: normalized,
      moments,
      playheadIdx: 1,
      revealSpoilers: false,
    });
    expect(mid.visibleNow).toHaveLength(1);
    expect(mid.visibleNow[0].text).toBe("Range entry");

    const after = getVisibleCommentary({
      entries: normalized,
      moments,
      playheadIdx: 3,
      revealSpoilers: false,
    });
    expect(after.visibleNow).toHaveLength(2);
    expect(after.visibleForMoment("moment-1")).toHaveLength(1);
  });
});
