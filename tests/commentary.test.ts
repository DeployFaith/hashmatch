import { describe, expect, it } from "vitest";
import {
  parseCommentaryFile,
  getVisibleCommentary,
  getCommentaryAtIndex,
  getCommentaryForMoment,
} from "../src/lib/replay/commentary.js";
import type { CommentaryEntry } from "../src/lib/replay/commentary.js";
import type { ReplayMoment } from "../src/lib/replay/detectMoments.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const moments: ReplayMoment[] = [
  { id: "moment-pre-game", label: "Match setup", start_event_idx: 0, end_event_idx: 0 },
  { id: "moment-turn-1", label: "Turn 1", start_event_idx: 1, end_event_idx: 8 },
  { id: "moment-turn-2", label: "Turn 2", start_event_idx: 9, end_event_idx: 16 },
];

const EVENT_COUNT = 18; // seq 0–17

function makeCommentaryJson(entries: unknown[], extra?: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, entries, ...extra });
}

// ---------------------------------------------------------------------------
// Parsing tests
// ---------------------------------------------------------------------------

describe("parseCommentaryFile", () => {
  describe("valid entries", () => {
    it("parses a moment-bound entry", () => {
      const text = makeCommentaryJson([
        { momentId: "moment-turn-1", text: "Great opening move!", speaker: "Alice" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(result.entries[0].kind).toBe("moment");
      if (result.entries[0].kind === "moment") {
        expect(result.entries[0].momentId).toBe("moment-turn-1");
      }
      expect(result.entries[0].text).toBe("Great opening move!");
      expect(result.entries[0].speaker).toBe("Alice");
    });

    it("parses a range-bound entry", () => {
      const text = makeCommentaryJson([
        { startEventIdx: 2, endEventIdx: 5, text: "Interesting sequence", severity: "analysis" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(result.entries[0].kind).toBe("range");
      if (result.entries[0].kind === "range") {
        expect(result.entries[0].startEventIdx).toBe(2);
        expect(result.entries[0].endEventIdx).toBe(5);
      }
      expect(result.entries[0].severity).toBe("analysis");
    });

    it("prefers momentId when both momentId and range are present", () => {
      const text = makeCommentaryJson([
        {
          momentId: "moment-turn-1",
          startEventIdx: 99,
          endEventIdx: 100,
          text: "Dual-bound entry",
        },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].kind).toBe("moment");
    });

    it("clamps range to valid event bounds", () => {
      const text = makeCommentaryJson([
        { startEventIdx: -5, endEventIdx: 9999, text: "Out of bounds" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(1);
      if (result.entries[0].kind === "range") {
        expect(result.entries[0].startEventIdx).toBe(0);
        expect(result.entries[0].endEventIdx).toBe(17);
      }
    });

    it("parses tags as string array", () => {
      const text = makeCommentaryJson([
        { momentId: "moment-turn-1", text: "Tagged", tags: ["hype", "critical", 42] },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries[0].tags).toEqual(["hype", "critical"]);
    });

    it("defaults severity to info when invalid", () => {
      const text = makeCommentaryJson([
        { momentId: "moment-turn-1", text: "No severity" },
        { momentId: "moment-turn-1", text: "Bad severity", severity: "extreme" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries[0].severity).toBe("info");
      expect(result.entries[1].severity).toBe("info");
    });

    it("accepts all valid severities", () => {
      const severities = ["hype", "analysis", "ref", "info"];
      const entries = severities.map((s) => ({
        momentId: "moment-turn-1",
        text: `Severity ${s}`,
        severity: s,
      }));
      const text = makeCommentaryJson(entries);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(4);
      result.entries.forEach((entry, i) => {
        expect(entry.severity).toBe(severities[i]);
      });
    });

    it("assigns auto-generated IDs when id is missing", () => {
      const text = makeCommentaryJson([
        { momentId: "moment-turn-1", text: "Entry A" },
        { momentId: "moment-turn-2", text: "Entry B" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries[0].id).toBe("commentary-0");
      expect(result.entries[1].id).toBe("commentary-1");
    });

    it("uses provided id when present", () => {
      const text = makeCommentaryJson([
        { id: "custom-id", momentId: "moment-turn-1", text: "Custom ID entry" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries[0].id).toBe("custom-id");
    });

    it("preserves extra fields without error", () => {
      const text = makeCommentaryJson([
        {
          momentId: "moment-turn-1",
          text: "Extra fields",
          customField: "should be ignored",
          nested: { a: 1 },
        },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("invalid entries are ignored without throwing", () => {
    it("ignores entries with missing text", () => {
      const text = makeCommentaryJson([
        { momentId: "moment-turn-1" },
        { momentId: "moment-turn-1", text: "" },
        { momentId: "moment-turn-1", text: "Valid" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(1);
      expect(result.warnings).toHaveLength(2);
    });

    it("ignores entries with unknown momentId", () => {
      const text = makeCommentaryJson([
        { momentId: "nonexistent-moment", text: "Ghost moment" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("Unknown momentId");
    });

    it("ignores entries without momentId or range", () => {
      const text = makeCommentaryJson([{ text: "No binding" }]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
    });

    it("ignores non-object entries", () => {
      const text = makeCommentaryJson(["string", 42, null, true]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(0);
      expect(result.warnings).toHaveLength(4);
    });

    it("handles invalid JSON gracefully", () => {
      const result = parseCommentaryFile("not json at all", moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toBe("Invalid JSON");
    });

    it("handles non-object top level", () => {
      const result = parseCommentaryFile("[1,2,3]", moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
    });

    it("handles missing entries array", () => {
      const result = parseCommentaryFile('{"version": 1}', moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("entries");
    });
  });

  describe("deterministic ordering", () => {
    it("sorts entries by effective start index", () => {
      const text = makeCommentaryJson([
        { startEventIdx: 10, endEventIdx: 12, text: "Later range" },
        { momentId: "moment-turn-1", text: "Turn 1 moment" },
        { startEventIdx: 0, endEventIdx: 2, text: "Early range" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries).toHaveLength(3);
      // moment-turn-1 starts at idx 1, early range at 0, later range at 10
      expect(result.entries[0].text).toBe("Early range");
      expect(result.entries[1].text).toBe("Turn 1 moment");
      expect(result.entries[2].text).toBe("Later range");
    });

    it("produces identical ordering for identical input", () => {
      const text = makeCommentaryJson([
        { id: "b", startEventIdx: 5, endEventIdx: 5, text: "B" },
        { id: "a", startEventIdx: 5, endEventIdx: 5, text: "A" },
        { id: "c", momentId: "moment-turn-1", text: "C" },
      ]);
      const result1 = parseCommentaryFile(text, moments, EVENT_COUNT);
      const result2 = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result1.entries.map((e) => e.id)).toEqual(result2.entries.map((e) => e.id));
    });

    it("uses id as stable tie-breaker when start indices match", () => {
      const text = makeCommentaryJson([
        { id: "z-entry", startEventIdx: 3, endEventIdx: 3, text: "Z" },
        { id: "a-entry", startEventIdx: 3, endEventIdx: 3, text: "A" },
      ]);
      const result = parseCommentaryFile(text, moments, EVENT_COUNT);
      expect(result.entries[0].id).toBe("a-entry");
      expect(result.entries[1].id).toBe("z-entry");
    });
  });
});

// ---------------------------------------------------------------------------
// Visibility / spoiler gating tests
// ---------------------------------------------------------------------------

describe("getVisibleCommentary", () => {
  const entries: CommentaryEntry[] = [
    {
      kind: "moment",
      id: "c1",
      momentId: "moment-turn-1",
      text: "Turn 1 comment",
      severity: "info",
      tags: [],
    },
    {
      kind: "moment",
      id: "c2",
      momentId: "moment-turn-2",
      text: "Turn 2 comment",
      severity: "info",
      tags: [],
    },
    {
      kind: "range",
      id: "c3",
      startEventIdx: 15,
      endEventIdx: 17,
      text: "Late range",
      severity: "info",
      tags: [],
    },
  ];

  it("hides future entries when spoilers are off", () => {
    // Playhead at index 5 (within turn 1)
    const visible = getVisibleCommentary(entries, 5, moments, false);
    // c1 starts at 1 (<=5): visible
    // c2 starts at 9 (>5): hidden
    // c3 starts at 15 (>5): hidden
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("c1");
  });

  it("shows all entries when spoilers are on", () => {
    const visible = getVisibleCommentary(entries, 5, moments, true);
    expect(visible).toHaveLength(3);
  });

  it("shows entries exactly at the playhead start index", () => {
    // Playhead at index 9 (turn 2 start)
    const visible = getVisibleCommentary(entries, 9, moments, false);
    expect(visible.map((e) => e.id)).toEqual(["c1", "c2"]);
  });

  it("shows all entries at end of replay", () => {
    const visible = getVisibleCommentary(entries, 17, moments, false);
    expect(visible).toHaveLength(3);
  });
});

describe("getCommentaryAtIndex", () => {
  const entries: CommentaryEntry[] = [
    {
      kind: "moment",
      id: "c1",
      momentId: "moment-turn-1",
      text: "Moment-bound to turn 1",
      severity: "info",
      tags: [],
    },
    {
      kind: "range",
      id: "c2",
      startEventIdx: 3,
      endEventIdx: 6,
      text: "Range within turn 1",
      severity: "analysis",
      tags: [],
    },
    {
      kind: "range",
      id: "c3",
      startEventIdx: 10,
      endEventIdx: 14,
      text: "Range within turn 2",
      severity: "hype",
      tags: [],
    },
  ];

  it("returns entries active at a specific event index", () => {
    // Index 4 is within turn 1 (1-8) and range c2 (3-6)
    const result = getCommentaryAtIndex(entries, 4, moments, 17, true);
    expect(result.map((e) => e.id)).toEqual(["c1", "c2"]);
  });

  it("returns no entries when index is outside all ranges", () => {
    // Index 0 is pre-game, before turn 1 starts at 1
    const result = getCommentaryAtIndex(entries, 0, moments, 17, true);
    expect(result).toHaveLength(0);
  });

  it("gates future commentary when spoilers are off", () => {
    // Playhead at index 4, c3 starts at 10 — should be hidden
    const result = getCommentaryAtIndex(entries, 4, moments, 4, false);
    expect(result.map((e) => e.id)).toEqual(["c1", "c2"]);
  });
});

describe("getCommentaryForMoment", () => {
  const entries: CommentaryEntry[] = [
    {
      kind: "moment",
      id: "c1",
      momentId: "moment-turn-1",
      text: "Direct moment match",
      severity: "info",
      tags: [],
    },
    {
      kind: "range",
      id: "c2",
      startEventIdx: 5,
      endEventIdx: 10,
      text: "Overlaps turn 1 and turn 2",
      severity: "analysis",
      tags: [],
    },
    {
      kind: "moment",
      id: "c3",
      momentId: "moment-turn-2",
      text: "Turn 2 only",
      severity: "hype",
      tags: [],
    },
  ];

  it("returns entries bound to the moment plus overlapping ranges", () => {
    const turn1 = moments[1]; // turn 1: idx 1–8
    const result = getCommentaryForMoment(entries, turn1, moments, 17, true);
    // c1: bound to turn 1 directly
    // c2: range 5-10 overlaps 1-8
    // c3: bound to turn 2, not turn 1
    expect(result.map((e) => e.id)).toEqual(["c1", "c2"]);
  });

  it("gates future commentary for moment queries", () => {
    const turn2 = moments[2]; // turn 2: idx 9–16
    // Playhead at 5, turn 2 starts at 9 — c3 hidden
    const result = getCommentaryForMoment(entries, turn2, moments, 5, false);
    // c2 starts at 5 (<=5): visible, overlaps turn 2 range
    // c3 starts at 9 (>5): hidden
    expect(result.map((e) => e.id)).toEqual(["c2"]);
  });
});
