import { describe, it, expect } from "vitest";
import { formatEvent, safeJsonPreview } from "../src/lib/replay/formatEvent";

// ---------------------------------------------------------------------------
// safeJsonPreview
// ---------------------------------------------------------------------------

describe("safeJsonPreview", () => {
  it("stringifies a simple object", () => {
    expect(safeJsonPreview({ a: 1 })).toBe('{"a":1}');
  });

  it("truncates long output to maxLen", () => {
    const obj = { key: "a".repeat(200) };
    const result = safeJsonPreview(obj, 30);
    expect(result.length).toBeLessThanOrEqual(31); // 30 + ellipsis char
    expect(result).toMatch(/…$/);
  });

  it("returns short strings without truncation", () => {
    expect(safeJsonPreview("hi", 100)).toBe('"hi"');
  });

  it("handles undefined values", () => {
    // JSON.stringify(undefined) returns undefined
    expect(safeJsonPreview(undefined)).toBe("[undefined]");
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(safeJsonPreview(obj)).toBe("[unserializable]");
  });

  it("handles null", () => {
    expect(safeJsonPreview(null)).toBe("null");
  });

  it("handles arrays", () => {
    expect(safeJsonPreview([1, 2, 3])).toBe("[1,2,3]");
  });
});

// ---------------------------------------------------------------------------
// MatchStarted
// ---------------------------------------------------------------------------

describe("formatEvent — MatchStarted", () => {
  it("shows scenario name and agents", () => {
    const event = {
      type: "MatchStarted",
      scenarioName: "heist",
      agentIds: ["alice", "bob"],
      seed: 42,
      maxTurns: 20,
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("system");
    expect(result.primaryText).toBe("Match started: heist (alice vs bob)");
  });

  it("uses scenarioName param when event field missing", () => {
    const event = { type: "MatchStarted", agentIds: ["a"] };
    const result = formatEvent(event, "numberGuess");
    expect(result.primaryText).toContain("numberGuess");
  });

  it("handles missing agentIds", () => {
    const event = { type: "MatchStarted", scenarioName: "heist" };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Match started: heist");
    expect(result.badge).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// MatchEnded
// ---------------------------------------------------------------------------

describe("formatEvent — MatchEnded", () => {
  it("computes winner from scores", () => {
    const event = {
      type: "MatchEnded",
      scores: { alice: 10, bob: 5 },
      reason: "completed",
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("end");
    expect(result.primaryText).toBe("Match ended. Winner: alice");
    expect(result.details).toBe("Reason: completed");
  });

  it("prefers explicit winner field", () => {
    const event = {
      type: "MatchEnded",
      winner: "bob",
      scores: { alice: 10, bob: 5 },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Match ended. Winner: bob");
  });

  it("shows none when no scores", () => {
    const event = { type: "MatchEnded" };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Match ended. Winner: none");
  });
});

// ---------------------------------------------------------------------------
// TurnStarted
// ---------------------------------------------------------------------------

describe("formatEvent — TurnStarted", () => {
  it("shows turn number", () => {
    const result = formatEvent({ type: "TurnStarted", turn: 5 }, "heist");
    expect(result.primaryText).toBe("Turn 5 started");
    expect(result.badge).toBe("system");
  });

  it("handles missing turn", () => {
    const result = formatEvent({ type: "TurnStarted" }, "heist");
    expect(result.primaryText).toBe("Turn ? started");
  });
});

// ---------------------------------------------------------------------------
// AgentError
// ---------------------------------------------------------------------------

describe("formatEvent — AgentError", () => {
  it("shows error message and agent", () => {
    const event = {
      type: "AgentError",
      agentId: "alice",
      message: "Timeout exceeded",
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("invalid");
    expect(result.primaryText).toBe("Error (alice): Timeout exceeded");
  });

  it("handles missing agentId", () => {
    const event = { type: "AgentError", message: "Crash" };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Error: Crash");
  });
});

// ---------------------------------------------------------------------------
// ObservationEmitted
// ---------------------------------------------------------------------------

describe("formatEvent — ObservationEmitted", () => {
  it("shows agent receiving observation", () => {
    const event = {
      type: "ObservationEmitted",
      agentId: "bob",
      turn: 3,
      observation: { room: "hallway" },
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("system");
    expect(result.primaryText).toBe("Observation \u2192 bob");
  });

  it("handles missing agentId", () => {
    const result = formatEvent({ type: "ObservationEmitted" }, "heist");
    expect(result.primaryText).toBe("Observation \u2192 unknown");
  });
});

// ---------------------------------------------------------------------------
// AgentRawOutput
// ---------------------------------------------------------------------------

describe("formatEvent — AgentRawOutput", () => {
  it("shows agent and byte count", () => {
    const event = {
      type: "AgentRawOutput",
      agentId: "alice",
      rawBytes: 1024,
      rawSha256: "abc",
      truncated: false,
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("system");
    expect(result.primaryText).toBe("Raw output \u2190 alice (1024 bytes)");
  });

  it("handles missing fields", () => {
    const result = formatEvent({ type: "AgentRawOutput" }, "heist");
    expect(result.primaryText).toBe("Raw output \u2190 unknown");
  });
});

// ---------------------------------------------------------------------------
// ActionSubmitted — Heist
// ---------------------------------------------------------------------------

describe("formatEvent — ActionSubmitted (heist)", () => {
  it("formats move action", () => {
    const event = {
      type: "ActionSubmitted",
      agentId: "alice",
      action: { type: "move", toRoomId: "room-3" },
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("action");
    expect(result.primaryText).toBe("Action: move (target=room-3)");
  });

  it("formats pickup action", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "pickup", itemId: "keycard-1" },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Action: pickup (item=keycard-1)");
  });

  it("formats use_terminal action", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "use_terminal", terminalId: "term-1" },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Action: use_terminal (terminal=term-1)");
  });

  it("formats interact action", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "interact", target: "door-1", item: "keycard" },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe(
      "Action: interact (target=door-1, using=keycard)",
    );
  });

  it("formats use_item action", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "use_item", itemId: "emp", target: "camera-1" },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe(
      "Action: use_item (item=emp, target=camera-1)",
    );
  });

  it("formats extract action", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "extract" },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Action: extract");
    expect(result.badge).toBe("action");
  });

  it("formats wait action with wait badge", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "wait" },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Action: wait");
    expect(result.badge).toBe("wait");
  });

  it("handles unknown heist action type", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "hack", target: "server" },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Action: hack");
    expect(result.badge).toBe("action");
  });
});

// ---------------------------------------------------------------------------
// ActionSubmitted — NumberGuess
// ---------------------------------------------------------------------------

describe("formatEvent — ActionSubmitted (numberGuess)", () => {
  it("formats guess action (legacy format)", () => {
    const event = {
      type: "ActionSubmitted",
      action: { guess: 50 },
    };
    const result = formatEvent(event, "numberGuess");
    expect(result.primaryText).toBe("Action: guess (value=50)");
    expect(result.badge).toBe("action");
  });

  it("formats guess action (modern format)", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "guess", value: 73 },
    };
    const result = formatEvent(event, "numberGuess");
    expect(result.primaryText).toBe("Action: guess (value=73)");
  });

  it("falls back for unrecognized action shape", () => {
    const event = {
      type: "ActionSubmitted",
      action: { foo: "bar" },
    };
    const result = formatEvent(event, "numberGuess");
    expect(result.primaryText).toContain("Action:");
    expect(result.badge).toBe("action");
  });
});

// ---------------------------------------------------------------------------
// ActionSubmitted — ResourceRivals
// ---------------------------------------------------------------------------

describe("formatEvent — ActionSubmitted (resourceRivals)", () => {
  it("formats bid action (legacy format)", () => {
    const event = {
      type: "ActionSubmitted",
      action: { bid: 10 },
    };
    const result = formatEvent(event, "resourceRivals");
    expect(result.primaryText).toBe("Action: bid (amount=10)");
    expect(result.badge).toBe("action");
  });

  it("formats bid action (modern format)", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "bid", amount: 25 },
    };
    const result = formatEvent(event, "resourceRivals");
    expect(result.primaryText).toBe("Action: bid (amount=25)");
  });
});

// ---------------------------------------------------------------------------
// ActionAdjudicated — valid
// ---------------------------------------------------------------------------

describe("formatEvent — ActionAdjudicated (valid)", () => {
  it("formats based on chosenAction (applied action)", () => {
    const event = {
      type: "ActionAdjudicated",
      agentId: "alice",
      valid: true,
      chosenAction: { type: "move", toRoomId: "room-5" },
      feedback: { message: "Moved successfully" },
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("action");
    expect(result.primaryText).toBe("Action: move (target=room-5)");
    expect(result.details).toBe("Moved successfully");
  });

  it("prefers chosenAction over action when both present", () => {
    const event = {
      type: "ActionAdjudicated",
      valid: true,
      action: { type: "move", toRoomId: "room-1" },
      chosenAction: { type: "move", toRoomId: "room-2" },
      feedback: null,
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
    };
    const result = formatEvent(event, "heist");
    // primaryText should be based on chosenAction (room-2), not action (room-1)
    expect(result.primaryText).toBe("Action: move (target=room-2)");
    // details should show the requested action
    expect(result.details).toContain("Requested:");
    expect(result.details).toContain("room-1");
  });

  it("shows numberGuess feedback in details", () => {
    const event = {
      type: "ActionAdjudicated",
      valid: true,
      chosenAction: { guess: 50 },
      feedback: { feedback: "higher" },
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
    };
    const result = formatEvent(event, "numberGuess");
    expect(result.primaryText).toBe("Action: guess (value=50)");
    expect(result.details).toBe("Result: higher");
  });

  it("assigns wait badge for wait actions", () => {
    const event = {
      type: "ActionAdjudicated",
      valid: true,
      chosenAction: { type: "wait" },
      feedback: null,
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("wait");
    expect(result.primaryText).toBe("Action: wait");
  });
});

// ---------------------------------------------------------------------------
// ActionAdjudicated — invalid
// ---------------------------------------------------------------------------

describe("formatEvent — ActionAdjudicated (invalid)", () => {
  it("shows REJECTED with error from feedback", () => {
    const event = {
      type: "ActionAdjudicated",
      agentId: "noop-0",
      valid: false,
      feedback: { error: "Invalid action payload." },
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
      chosenAction: {},
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("invalid");
    expect(result.primaryText).toBe("REJECTED: Invalid action payload.");
    expect(result.details).toContain("Applied:");
  });

  it("shows fallback reason in details", () => {
    const event = {
      type: "ActionAdjudicated",
      valid: false,
      feedback: { error: "Parse failed" },
      fallbackReason: "Agent timed out",
      chosenAction: { type: "wait" },
      method: "failed",
      warnings: [],
      errors: null,
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("invalid");
    expect(result.details).toContain("Fallback: Agent timed out");
    expect(result.details).toContain("Applied:");
  });

  it("handles string feedback", () => {
    const event = {
      type: "ActionAdjudicated",
      valid: false,
      feedback: "out of range",
      method: "direct-json",
      warnings: [],
      errors: null,
      fallbackReason: null,
    };
    const result = formatEvent(event, "numberGuess");
    expect(result.primaryText).toBe("REJECTED: out of range");
  });
});

// ---------------------------------------------------------------------------
// InvalidAction (future event type)
// ---------------------------------------------------------------------------

describe("formatEvent — InvalidAction", () => {
  it("shows REJECTED with reason", () => {
    const event = {
      type: "InvalidAction",
      reason: "Action schema mismatch",
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("invalid");
    expect(result.primaryText).toBe("REJECTED: Action schema mismatch");
    expect(result.details).toBeUndefined();
  });

  it("shows attempted action in details when present", () => {
    const event = {
      type: "InvalidAction",
      reason: "Unknown action type",
      attemptedAction: { type: "fly", target: "moon" },
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("invalid");
    expect(result.primaryText).toBe("REJECTED: Unknown action type");
    expect(result.details).toContain("Attempted:");
    expect(result.details).toContain("fly");
  });

  it("defaults reason to Unknown reason when missing", () => {
    const event = { type: "InvalidAction" };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("REJECTED: Unknown reason");
  });

  it("truncates long attemptedAction", () => {
    const event = {
      type: "InvalidAction",
      reason: "Bad",
      attemptedAction: { data: "x".repeat(300) },
    };
    const result = formatEvent(event, "heist");
    expect(result.details!.length).toBeLessThan(250);
  });
});

// ---------------------------------------------------------------------------
// StateUpdated
// ---------------------------------------------------------------------------

describe("formatEvent — StateUpdated", () => {
  it("formats numberGuess feedback", () => {
    const event = {
      type: "StateUpdated",
      turn: 3,
      summary: {
        winner: null,
        agentFeedback: {
          alice: { lastGuess: 50, feedback: "higher", guessCount: 1 },
          bob: { lastGuess: 75, feedback: "lower", guessCount: 1 },
        },
      },
    };
    const result = formatEvent(event, "numberGuess");
    expect(result.primaryText).toContain("alice: 50 \u2192 higher");
    expect(result.primaryText).toContain("bob: 75 \u2192 lower");
    expect(result.badge).toBe("system");
  });

  it("formats scores in summary as score badge", () => {
    const event = {
      type: "StateUpdated",
      turn: 5,
      summary: {
        scores: { alice: 10, bob: 7 },
        currentObjective: 3,
        totalObjectives: 12,
      },
    };
    const result = formatEvent(event, "resourceRivals");
    expect(result.badge).toBe("score");
    expect(result.primaryText).toContain("alice=10");
    expect(result.primaryText).toContain("bob=7");
  });

  it("formats heist alert level", () => {
    const event = {
      type: "StateUpdated",
      turn: 2,
      summary: {
        turn: 2,
        alertLevel: 1,
        agents: {},
      },
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("State: alert=1, turn=2");
    expect(result.badge).toBe("system");
  });

  it("formats resourceRivals objective progress (no scores)", () => {
    const event = {
      type: "StateUpdated",
      summary: {
        currentObjective: 5,
        totalObjectives: 12,
      },
    };
    const result = formatEvent(event, "resourceRivals");
    expect(result.primaryText).toBe("Round 6 of 12");
    expect(result.badge).toBe("system");
  });

  it("falls back to State updated for empty summary", () => {
    const event = { type: "StateUpdated", summary: null };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("State updated");
    expect(result.badge).toBe("system");
  });

  it("shows truncated JSON for unrecognized summary shape", () => {
    const event = {
      type: "StateUpdated",
      summary: { custom: "data" },
    };
    const result = formatEvent(event, "unknownScenario");
    expect(result.primaryText).toBe("State updated");
    expect(result.details).toBeDefined();
    expect(result.badge).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// Unknown event types — fallback
// ---------------------------------------------------------------------------

describe("formatEvent — unknown event types", () => {
  it("falls back to type + truncated JSON", () => {
    const event = {
      type: "CustomEvent",
      data: "hello",
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("system");
    expect(result.primaryText).toContain("CustomEvent:");
  });

  it("handles missing type field", () => {
    const event = { data: 42 };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toContain("Unknown:");
    expect(result.badge).toBe("system");
  });

  it("score-bearing unknown events get score badge", () => {
    const event = {
      type: "RoundResult",
      scores: { alice: 5, bob: 3 },
    };
    const result = formatEvent(event, "resourceRivals");
    expect(result.badge).toBe("score");
    expect(result.primaryText).toContain("alice=5");
    expect(result.primaryText).toContain("bob=3");
  });

  it("action-bearing unknown events get formatted action", () => {
    const event = {
      type: "LateBind",
      chosenAction: { type: "move", toRoomId: "room-7" },
      action: { type: "move", toRoomId: "room-1" },
    };
    const result = formatEvent(event, "heist");
    expect(result.badge).toBe("action");
    // Should use chosenAction (applied), not action (requested)
    expect(result.primaryText).toBe("Action: move (target=room-7)");
    expect(result.details).toContain("Requested:");
    expect(result.details).toContain("room-1");
  });
});

// ---------------------------------------------------------------------------
// Edge cases — missing / malformed fields
// ---------------------------------------------------------------------------

describe("formatEvent — resilience", () => {
  it("handles empty object", () => {
    const result = formatEvent({}, "heist");
    expect(result.badge).toBe("system");
    expect(result.primaryText).toBeDefined();
    expect(result.primaryText.length).toBeGreaterThan(0);
  });

  it("handles non-string type field", () => {
    const result = formatEvent({ type: 42 } as unknown as Record<string, unknown>, "heist");
    expect(result.badge).toBe("system");
    expect(result.primaryText).toContain("Unknown:");
  });

  it("handles action as non-object", () => {
    const event = {
      type: "ActionSubmitted",
      action: "not an object",
    };
    const result = formatEvent(event, "heist");
    expect(result.primaryText).toBe("Action submitted");
    expect(result.badge).toBe("action");
  });

  it("handles ActionAdjudicated with no valid field", () => {
    const event = {
      type: "ActionAdjudicated",
      chosenAction: { type: "wait" },
    };
    const result = formatEvent(event, "heist");
    // valid is not false, so it takes the valid branch
    expect(result.primaryText).toBe("Action: wait");
    expect(result.badge).toBe("wait");
  });

  it("handles NaN and Infinity in numeric fields", () => {
    const event = {
      type: "TurnStarted",
      turn: NaN,
    };
    const result = formatEvent(event, "heist");
    // NaN fails Number.isFinite check, so turn is undefined
    expect(result.primaryText).toBe("Turn ? started");
  });

  it("deterministic: same input always produces same output", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "move", toRoomId: "room-1" },
    };
    const a = formatEvent(event, "heist");
    const b = formatEvent(event, "heist");
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Scenario matching flexibility
// ---------------------------------------------------------------------------

describe("formatEvent — scenario name matching", () => {
  it("matches heist case-insensitively", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "move", toRoomId: "room-1" },
    };
    const result = formatEvent(event, "Heist");
    expect(result.primaryText).toBe("Action: move (target=room-1)");
  });

  it("matches numberGuess variants", () => {
    const event = {
      type: "ActionSubmitted",
      action: { guess: 42 },
    };
    expect(formatEvent(event, "NumberGuess").primaryText).toBe(
      "Action: guess (value=42)",
    );
    expect(formatEvent(event, "number-guess").primaryText).toBe(
      "Action: guess (value=42)",
    );
  });

  it("matches resourceRivals variants", () => {
    const event = {
      type: "ActionSubmitted",
      action: { bid: 15 },
    };
    expect(formatEvent(event, "ResourceRivals").primaryText).toBe(
      "Action: bid (amount=15)",
    );
    expect(formatEvent(event, "resource_rivals").primaryText).toBe(
      "Action: bid (amount=15)",
    );
  });

  it("uses generic formatting for unknown scenario", () => {
    const event = {
      type: "ActionSubmitted",
      action: { type: "zap", power: 9000 },
    };
    const result = formatEvent(event, "alienInvasion");
    expect(result.primaryText).toBe("Action: zap");
    expect(result.badge).toBe("action");
  });
});
