/**
 * Dev-only mock that simulates the frozen SSE contract for local testing
 * without a running backend. Emits fake events at configurable intervals.
 *
 * Usage (from the live match detail component):
 *   import { createMockLiveEventSource } from "@/lib/dev/mockEventSource";
 *   const source = createMockLiveEventSource("mock-match-1");
 */

import type { MatchEventSource, MatchEventSourceSnapshot } from "@/lib/replay/eventSource";
import type { ReplayEvent, ParseError } from "@/lib/replay/parseJsonl";
import type { SSEMatchStatusData, SSEMatchCompleteData } from "@/lib/matches/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MockEventSourceOptions {
  /** Interval between emitted events in ms. Default: 300. */
  intervalMs?: number;
  /** Total turns to simulate. Default: 20. */
  totalTurns?: number;
  /** Match ID to use in events. Default: provided matchId. */
  matchId?: string;
  /** Agent IDs. Default: ["agent-alpha", "agent-beta"]. */
  agents?: [string, string];
}

const DEFAULT_OPTIONS: Required<MockEventSourceOptions> = {
  intervalMs: 300,
  totalTurns: 20,
  matchId: "mock-match",
  agents: ["agent-alpha", "agent-beta"],
};

// ---------------------------------------------------------------------------
// Mock event generation
// ---------------------------------------------------------------------------

function generateMockEvents(
  matchId: string,
  totalTurns: number,
  agents: [string, string],
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  let seq = 0;

  // MatchStarted
  events.push({
    type: "MatchStarted",
    seq: seq++,
    matchId,
    raw: {
      type: "MatchStarted",
      seq: events.length,
      matchId,
      scenarioName: "number_guess",
      agentIds: agents,
      maxTurns: totalTurns,
      maxScore: 100,
    },
  });

  const scores: Record<string, number> = { [agents[0]]: 0, [agents[1]]: 0 };

  for (let turn = 1; turn <= totalTurns; turn++) {
    // TurnStarted
    events.push({
      type: "TurnStarted",
      seq: seq++,
      matchId,
      turn,
      raw: { type: "TurnStarted", seq: events.length, matchId, turn },
    });

    for (const agentId of agents) {
      // ObservationEmitted
      events.push({
        type: "ObservationEmitted",
        seq: seq++,
        matchId,
        turn,
        agentId,
        raw: {
          type: "ObservationEmitted",
          seq: events.length,
          matchId,
          turn,
          agentId,
          observation: { turn, message: "Your turn" },
        },
      });

      // ActionSubmitted
      const guess = Math.floor(Math.random() * 100) + 1;
      events.push({
        type: "ActionSubmitted",
        seq: seq++,
        matchId,
        turn,
        agentId,
        raw: {
          type: "ActionSubmitted",
          seq: events.length,
          matchId,
          turn,
          agentId,
          action: { guess },
        },
      });

      // ActionAdjudicated
      const points = Math.floor(Math.random() * 10);
      scores[agentId] += points;
      events.push({
        type: "ActionAdjudicated",
        seq: seq++,
        matchId,
        turn,
        agentId,
        raw: {
          type: "ActionAdjudicated",
          seq: events.length,
          matchId,
          turn,
          agentId,
          valid: true,
          points,
        },
      });
    }

    // StateUpdated with scores
    events.push({
      type: "StateUpdated",
      seq: seq++,
      matchId,
      turn,
      raw: {
        type: "StateUpdated",
        seq: events.length,
        matchId,
        turn,
        scores: { ...scores },
      },
    });
  }

  // MatchEnded
  const winner =
    scores[agents[0]] > scores[agents[1]]
      ? agents[0]
      : scores[agents[1]] > scores[agents[0]]
        ? agents[1]
        : null;
  events.push({
    type: "MatchEnded",
    seq: seq++,
    matchId,
    raw: {
      type: "MatchEnded",
      seq: events.length,
      matchId,
      scores: { ...scores },
      winner,
      reason: "All turns completed",
    },
  });

  return events;
}

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

/**
 * Creates a mock MatchEventSource that emits pre-generated events at a
 * configurable interval, simulating a live SSE stream. Useful for testing
 * the live viewer without a running backend.
 */
export function createMockLiveEventSource(
  matchId: string,
  opts?: MockEventSourceOptions,
): MatchEventSource {
  const config = { ...DEFAULT_OPTIONS, ...opts, matchId };
  const allEvents = generateMockEvents(config.matchId, config.totalTurns, config.agents);
  const listeners = new Set<() => void>();

  let emittedEvents: ReplayEvent[] = [];
  const errors: ParseError[] = [];
  let status: "loading" | "complete" | "error" = "loading";
  let liveStatus: SSEMatchStatusData | undefined;
  let completeInfo: SSEMatchCompleteData | undefined;
  let snapshot: MatchEventSourceSnapshot = Object.freeze({
    events: [],
    errors: [],
    status: "loading",
  });
  let closed = false;
  let eventIdx = 0;

  const notify = () => {
    if (closed) {
      return;
    }
    snapshot = Object.freeze({
      events: [...emittedEvents],
      errors: [...errors],
      status,
      liveStatus,
      completeInfo,
    });
    listeners.forEach((listener) => listener());
  };

  const interval = setInterval(() => {
    if (closed || eventIdx >= allEvents.length) {
      return;
    }

    const event = allEvents[eventIdx];
    emittedEvents = [...emittedEvents, event];
    eventIdx++;

    // Emit match_status heartbeat every 5 events
    if (eventIdx % 5 === 0) {
      const currentTurn = event.turn ?? Math.ceil(eventIdx / 6);
      liveStatus = {
        status: "running",
        turn: currentTurn,
        totalTurns: config.totalTurns,
      };
    }

    // Check if this is the last event (MatchEnded)
    if (eventIdx >= allEvents.length) {
      const lastEvent = allEvents[allEvents.length - 1];
      const finalScores = (lastEvent.raw.scores as Record<string, number>) ?? {};
      completeInfo = {
        status: "finished",
        verified: true,
        finalScores,
      };
      status = "complete";
      notify();
      clearInterval(interval);
      closed = true;
      return;
    }

    notify();
  }, config.intervalMs);

  return {
    kind: "live",
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(interval);
      listeners.clear();
    },
  };
}
