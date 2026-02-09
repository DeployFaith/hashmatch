import { describe, expect, it } from "vitest";
import { classifyFailureModes, FM_CLASSIFIER_VERSION } from "../src/lib/fm/index.js";
import type {
  ActionAdjudicatedEvent,
  ActionSubmittedEvent,
  AgentRawOutputEvent,
  InvalidActionEvent,
  MatchEndedEvent,
  MatchEvent,
} from "../src/contract/types.js";
import type { ScenarioHints } from "../src/contract/interfaces.js";

const scenarioHints: ScenarioHints = {
  noopActions: ["wait", "noop"],
  actionSpaceSize: 10,
};

const matchId = "match-1";
const agentId = "agent-1";

function makeActionSubmitted(
  seq: number,
  turn: number,
  action: ActionSubmittedEvent["action"],
): ActionSubmittedEvent {
  return {
    type: "ActionSubmitted",
    seq,
    matchId,
    agentId,
    turn,
    action,
  };
}

function makeInvalidAction(seq: number, turn: number, reason: string): InvalidActionEvent {
  return {
    type: "InvalidAction",
    seq,
    matchId,
    agentId,
    turn,
    reason,
    attemptedAction: null,
  };
}

function makeAdjudicated(seq: number, turn: number, method: ActionAdjudicatedEvent["method"]): ActionAdjudicatedEvent {
  return {
    type: "ActionAdjudicated",
    seq,
    matchId,
    agentId,
    turn,
    valid: true,
    feedback: { ok: true },
    method,
    warnings: [],
    errors: null,
    fallbackReason: null,
    chosenAction: { type: "noop" },
  };
}

function makeRawOutput(seq: number, turn: number, truncated: boolean): AgentRawOutputEvent {
  return {
    type: "AgentRawOutput",
    seq,
    matchId,
    agentId,
    turn,
    rawSha256: "deadbeef",
    rawBytes: 1024,
    truncated,
  };
}

function makeMatchEnded(seq: number, reason: MatchEndedEvent["reason"]): MatchEndedEvent {
  return {
    type: "MatchEnded",
    seq,
    matchId,
    reason,
    scores: { [agentId]: 0 },
    turns: 1,
  };
}

function getHits(events: MatchEvent[]): ReturnType<typeof classifyFailureModes> {
  return classifyFailureModes({
    events,
    scenarioHints,
    agentIds: [agentId],
  });
}

describe("fm classifier", () => {
  it("flags wait spam after 6 consecutive noops", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      makeActionSubmitted(index, index + 1, { type: "wait" }),
    );
    const result = getHits(events);
    expect(result.fmClassifierVersion).toBe(FM_CLASSIFIER_VERSION);
    expect(result.byAgentId[agentId]).toEqual([
      expect.objectContaining({ id: "FM-10", count: 6, detectorSource: "core" }),
    ]);
  });

  it("flags hallucinated tool calls on invalid actions", () => {
    const events = [
      makeActionSubmitted(0, 1, { type: "move" }),
      makeInvalidAction(1, 1, "Unknown action type: teleport"),
      makeInvalidAction(2, 2, "Invalid target for action"),
    ];
    const result = getHits(events);
    expect(result.byAgentId[agentId]).toEqual([
      expect.objectContaining({ id: "FM-06", count: 2 }),
    ]);
  });

  it("flags JSON recovery when adjudication is tolerant", () => {
    const events = [
      makeActionSubmitted(0, 1, { type: "move" }),
      makeAdjudicated(1, 1, "fenced-json"),
      makeAdjudicated(2, 2, "brace-extract"),
      makeAdjudicated(3, 3, "unwrapped"),
    ];
    const result = getHits(events);
    expect(result.byAgentId[agentId]).toEqual([
      expect.objectContaining({ id: "FM-13", count: 3 }),
    ]);
  });

  it("flags verbosity padding on truncated raw output", () => {
    const events = [makeRawOutput(0, 1, true)];
    const result = getHits(events);
    expect(result.byAgentId[agentId]).toEqual([
      expect.objectContaining({ id: "FM-12", count: 1 }),
    ]);
  });

  it("flags log budget exceeded when MatchEnded reason indicates it", () => {
    const events = [
      makeActionSubmitted(0, 1, { type: "move" }),
      makeMatchEnded(1, "logBudgetExceeded" as MatchEndedEvent["reason"]),
    ];
    const result = getHits(events);
    expect(result.byAgentId[agentId]).toEqual([
      expect.objectContaining({ id: "FM-15", count: 1 }),
    ]);
  });

  it("flags tool-call storms when action diversity is low", () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      makeActionSubmitted(index, index + 1, {
        type: "move",
        target: index % 2 === 0 ? "A" : "B",
      }),
    );
    const result = getHits(events);
    expect(result.byAgentId[agentId]).toEqual([
      expect.objectContaining({ id: "FM-16", count: 10 }),
    ]);
  });

  it("does not emit hits for a clean agent", () => {
    const events = [
      makeActionSubmitted(0, 1, { type: "move", target: "A" }),
      makeActionSubmitted(1, 2, { type: "move", target: "B" }),
      makeActionSubmitted(2, 3, { type: "scan", target: "C" }),
      makeActionSubmitted(3, 4, { type: "use", target: "D" }),
      makeMatchEnded(4, "completed"),
    ];
    const result = getHits(events);
    expect(result.byAgentId[agentId]).toEqual([]);
  });
});
