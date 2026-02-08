import { describe, expect, it } from "vitest";
import {
  parseMatchEventsJsonl,
  renderConsoleRecap,
  renderMarkdownRecap,
  truncateJson,
} from "../src/cli/replay-match.js";
import type { MatchEvent } from "../src/contract/types.js";

// ---------------------------------------------------------------------------
// Helpers: synthetic event sequences
// ---------------------------------------------------------------------------

function syntheticEvents(): MatchEvent[] {
  return [
    {
      type: "MatchStarted",
      seq: 0,
      matchId: "m_test123",
      seed: 42,
      agentIds: ["alice", "bob"],
      scenarioName: "numberGuess",
      maxTurns: 10,
    },
    { type: "TurnStarted", seq: 1, matchId: "m_test123", turn: 1 },
    {
      type: "ObservationEmitted",
      seq: 2,
      matchId: "m_test123",
      agentId: "alice",
      turn: 1,
      observation: { rangeMin: 1, rangeMax: 100 },
    },
    {
      type: "ActionSubmitted",
      seq: 3,
      matchId: "m_test123",
      agentId: "alice",
      turn: 1,
      action: { guess: 50 },
    },
    {
      type: "ActionAdjudicated",
      seq: 4,
      matchId: "m_test123",
      agentId: "alice",
      turn: 1,
      valid: true,
      feedback: "higher",
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
      chosenAction: { guess: 50 },
    },
    {
      type: "ObservationEmitted",
      seq: 5,
      matchId: "m_test123",
      agentId: "bob",
      turn: 1,
      observation: { rangeMin: 1, rangeMax: 100 },
    },
    {
      type: "ActionSubmitted",
      seq: 6,
      matchId: "m_test123",
      agentId: "bob",
      turn: 1,
      action: { guess: 75 },
    },
    {
      type: "ActionAdjudicated",
      seq: 7,
      matchId: "m_test123",
      agentId: "bob",
      turn: 1,
      valid: true,
      feedback: "correct",
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
      chosenAction: { guess: 75 },
    },
    {
      type: "StateUpdated",
      seq: 8,
      matchId: "m_test123",
      turn: 1,
      summary: { winner: "bob" },
    },
    {
      type: "MatchEnded",
      seq: 9,
      matchId: "m_test123",
      reason: "completed",
      scores: { alice: 0, bob: 100 },
      turns: 1,
      details: { _private: { secretNumber: 75 } },
    },
  ];
}

function toJsonl(events: MatchEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// truncateJson
// ---------------------------------------------------------------------------

describe("truncateJson", () => {
  it("returns short values unchanged", () => {
    expect(truncateJson("hello")).toBe('"hello"');
    expect(truncateJson(42)).toBe("42");
  });

  it("truncates long values with ellipsis", () => {
    const long = "x".repeat(200);
    const result = truncateJson(long, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith("...")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseMatchEventsJsonl
// ---------------------------------------------------------------------------

describe("parseMatchEventsJsonl", () => {
  it("parses valid JSONL into MatchEvent[]", () => {
    const events = syntheticEvents();
    const text = toJsonl(events);
    const parsed = parseMatchEventsJsonl(text);
    expect(parsed).toEqual(events);
  });

  it("ignores blank lines", () => {
    const events = syntheticEvents();
    const text = "\n" + events.map((e) => JSON.stringify(e)).join("\n\n") + "\n\n";
    const parsed = parseMatchEventsJsonl(text);
    expect(parsed).toEqual(events);
  });

  it("rejects invalid JSON line", () => {
    expect(() => parseMatchEventsJsonl("{not json\n")).toThrow("invalid JSON");
  });

  it("rejects non-object line", () => {
    expect(() => parseMatchEventsJsonl('"just a string"\n')).toThrow("expected a JSON object");
  });

  it("rejects array line", () => {
    expect(() => parseMatchEventsJsonl("[1,2,3]\n")).toThrow("expected a JSON object");
  });

  it("rejects missing type", () => {
    const line = JSON.stringify({ seq: 0, matchId: "m_x" });
    expect(() => parseMatchEventsJsonl(line)).toThrow('missing or non-string "type"');
  });

  it("rejects missing seq", () => {
    const line = JSON.stringify({ type: "MatchStarted", matchId: "m_x" });
    expect(() => parseMatchEventsJsonl(line)).toThrow('missing or non-number "seq"');
  });

  it("rejects missing matchId", () => {
    const line = JSON.stringify({ type: "MatchStarted", seq: 0 });
    expect(() => parseMatchEventsJsonl(line)).toThrow('missing or non-string "matchId"');
  });

  it("rejects unknown event type", () => {
    const line = JSON.stringify({ type: "FooBar", seq: 0, matchId: "m_x" });
    expect(() => parseMatchEventsJsonl(line)).toThrow('unknown event type "FooBar"');
  });

  it("rejects non-consecutive seq (gap)", () => {
    const events = syntheticEvents();
    // Introduce a gap: skip seq 1
    events[1] = { ...events[1], seq: 2 } as MatchEvent;
    const text = toJsonl(events);
    expect(() => parseMatchEventsJsonl(text)).toThrow("expected seq 1, got 2");
  });

  it("rejects non-consecutive seq (duplicate)", () => {
    const events = syntheticEvents();
    events[1] = { ...events[1], seq: 0 } as MatchEvent;
    const text = toJsonl(events);
    expect(() => parseMatchEventsJsonl(text)).toThrow("expected seq 1, got 0");
  });

  it("accepts seq starting at non-zero", () => {
    const events: MatchEvent[] = [
      {
        type: "MatchStarted",
        seq: 5,
        matchId: "m_x",
        seed: 1,
        agentIds: ["a"],
        scenarioName: "test",
        maxTurns: 1,
      },
      {
        type: "MatchEnded",
        seq: 6,
        matchId: "m_x",
        reason: "completed",
        scores: { a: 0 },
        turns: 0,
      },
    ];
    const parsed = parseMatchEventsJsonl(toJsonl(events));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].seq).toBe(5);
    expect(parsed[1].seq).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// renderConsoleRecap
// ---------------------------------------------------------------------------

describe("renderConsoleRecap", () => {
  it("contains match header fields", () => {
    const recap = renderConsoleRecap(syntheticEvents());
    expect(recap).toContain("m_test123");
    expect(recap).toContain("numberGuess");
    expect(recap).toContain("42");
    expect(recap).toContain("alice");
    expect(recap).toContain("bob");
  });

  it("contains turn markers", () => {
    const recap = renderConsoleRecap(syntheticEvents());
    expect(recap).toContain("Turn 1");
  });

  it("contains action details", () => {
    const recap = renderConsoleRecap(syntheticEvents());
    expect(recap).toContain("[alice] action:");
    expect(recap).toContain("[bob] action:");
  });

  it("contains result footer", () => {
    const recap = renderConsoleRecap(syntheticEvents());
    expect(recap).toContain("RESULT");
    expect(recap).toContain("completed");
    expect(recap).toContain("secretNumber");
  });
});

// ---------------------------------------------------------------------------
// renderMarkdownRecap
// ---------------------------------------------------------------------------

describe("renderMarkdownRecap", () => {
  it("starts with a markdown heading", () => {
    const md = renderMarkdownRecap(syntheticEvents());
    expect(md).toMatch(/^# Match Recap/);
  });

  it("contains match metadata table", () => {
    const md = renderMarkdownRecap(syntheticEvents());
    expect(md).toContain("| Match ID |");
    expect(md).toContain("`m_test123`");
    expect(md).toContain("numberGuess");
  });

  it("contains turn headings", () => {
    const md = renderMarkdownRecap(syntheticEvents());
    expect(md).toContain("### Turn 1");
  });

  it("contains agent actions in bold", () => {
    const md = renderMarkdownRecap(syntheticEvents());
    expect(md).toContain("**alice**");
    expect(md).toContain("**bob**");
  });

  it("contains result table with scores", () => {
    const md = renderMarkdownRecap(syntheticEvents());
    expect(md).toContain("## Result");
    expect(md).toContain("completed");
    expect(md).toContain("alice");
    expect(md).toContain("bob");
  });

  it("includes details when present", () => {
    const md = renderMarkdownRecap(syntheticEvents());
    expect(md).toContain("Details");
    expect(md).toContain("secretNumber");
  });

  it("omits details row when not present", () => {
    const events = syntheticEvents();
    // Remove details from MatchEnded
    const ended = events[events.length - 1];
    if (ended.type === "MatchEnded") {
      delete (ended as unknown as Record<string, unknown>)["details"];
    }
    const md = renderMarkdownRecap(events);
    expect(md).not.toContain("| Details |");
  });
});

// ---------------------------------------------------------------------------
// AgentError rendering
// ---------------------------------------------------------------------------

describe("AgentError rendering", () => {
  it("shows agent errors in console recap", () => {
    const events: MatchEvent[] = [
      {
        type: "MatchStarted",
        seq: 0,
        matchId: "m_err",
        seed: 1,
        agentIds: ["a"],
        scenarioName: "test",
        maxTurns: 1,
      },
      { type: "TurnStarted", seq: 1, matchId: "m_err", turn: 1 },
      {
        type: "AgentError",
        seq: 2,
        matchId: "m_err",
        agentId: "a",
        turn: 1,
        message: "boom",
      },
      {
        type: "StateUpdated",
        seq: 3,
        matchId: "m_err",
        turn: 1,
        summary: {},
      },
      {
        type: "MatchEnded",
        seq: 4,
        matchId: "m_err",
        reason: "completed",
        scores: { a: 0 },
        turns: 1,
      },
    ];
    const recap = renderConsoleRecap(events);
    expect(recap).toContain("[a] ERROR: boom");
  });

  it("shows agent errors in markdown recap", () => {
    const events: MatchEvent[] = [
      {
        type: "MatchStarted",
        seq: 0,
        matchId: "m_err",
        seed: 1,
        agentIds: ["a"],
        scenarioName: "test",
        maxTurns: 1,
      },
      { type: "TurnStarted", seq: 1, matchId: "m_err", turn: 1 },
      {
        type: "AgentError",
        seq: 2,
        matchId: "m_err",
        agentId: "a",
        turn: 1,
        message: "boom",
      },
      {
        type: "StateUpdated",
        seq: 3,
        matchId: "m_err",
        turn: 1,
        summary: {},
      },
      {
        type: "MatchEnded",
        seq: 4,
        matchId: "m_err",
        reason: "completed",
        scores: { a: 0 },
        turns: 1,
      },
    ];
    const md = renderMarkdownRecap(events);
    expect(md).toContain("**a** ERROR: boom");
  });
});
