import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../src/contract/types.js";
import { detectMoments } from "../src/lib/replay/detectMoments.js";

const baseMatch = {
  type: "MatchStarted",
  seq: 0,
  matchId: "match-1",
  seed: 42,
  agentIds: ["alpha", "bravo"],
  scenarioName: "Synthetic",
  maxTurns: 10,
} satisfies MatchEvent;

function stateUpdated(seq: number, turn: number, scores: Record<string, number>): MatchEvent {
  return {
    type: "StateUpdated",
    seq,
    matchId: "match-1",
    turn,
    summary: { scores },
  } satisfies MatchEvent;
}

function matchEnded(seq: number, turns: number, scores: Record<string, number>): MatchEvent {
  return {
    type: "MatchEnded",
    seq,
    matchId: "match-1",
    reason: "completed",
    scores,
    turns,
  } satisfies MatchEvent;
}

describe("detectMoments", () => {
  it("detects a score swing from synthetic scores", () => {
    const events: MatchEvent[] = [
      baseMatch,
      stateUpdated(1, 1, { alpha: 0, bravo: 0 }),
      stateUpdated(2, 2, { alpha: 20, bravo: 0 }),
      matchEnded(3, 2, { alpha: 20, bravo: 0 }),
    ];

    const moments = detectMoments(events, { scoreSwingThreshold: 5, scoreSwingWindow: 2 });
    expect(moments.some((moment) => moment.type === "score_swing")).toBe(true);
  });

  it("detects a lead change when the leader flips", () => {
    const events: MatchEvent[] = [
      baseMatch,
      stateUpdated(1, 1, { alpha: 10, bravo: 5 }),
      stateUpdated(2, 2, { alpha: 12, bravo: 15 }),
      matchEnded(3, 2, { alpha: 12, bravo: 15 }),
    ];

    const moments = detectMoments(events, {
      scoreSwingThreshold: 999,
      leadChangeMinDelta: 1,
    });

    expect(moments.some((moment) => moment.type === "lead_change")).toBe(true);
  });

  it("detects a clutch finish when the winner takes the lead late", () => {
    const events: MatchEvent[] = [
      baseMatch,
      stateUpdated(1, 1, { alpha: 5, bravo: 0 }),
      stateUpdated(2, 5, { alpha: 10, bravo: 8 }),
      stateUpdated(3, 9, { alpha: 12, bravo: 12 }),
      stateUpdated(4, 10, { alpha: 12, bravo: 15 }),
      matchEnded(5, 10, { alpha: 12, bravo: 15 }),
    ];

    const moments = detectMoments(events, { scoreSwingThreshold: 999 });
    expect(moments.some((moment) => moment.type === "clutch")).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const events: MatchEvent[] = [
      baseMatch,
      stateUpdated(1, 1, { alpha: 0, bravo: 0 }),
      stateUpdated(2, 2, { alpha: 6, bravo: 2 }),
      matchEnded(3, 2, { alpha: 6, bravo: 2 }),
    ];

    const config = { scoreSwingThreshold: 3 };
    const first = detectMoments(events, config);
    const second = detectMoments(events, config);

    expect(first).toEqual(second);
  });

  it("returns empty when score signals are missing", () => {
    const events: MatchEvent[] = [
      baseMatch,
      { type: "TurnStarted", seq: 1, matchId: "match-1", turn: 1 },
      {
        type: "ActionSubmitted",
        seq: 2,
        matchId: "match-1",
        turn: 1,
        agentId: "alpha",
        action: {},
      },
      matchEnded(3, 1, { alpha: 0, bravo: 0 }),
    ];

    const moments = detectMoments(events, { scoreSwingThreshold: 999, closeCallThreshold: -1 });
    expect(moments).toEqual([]);
  });
});
