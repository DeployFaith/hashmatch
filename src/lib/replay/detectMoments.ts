import type { ReplayEvent } from "./parseJsonl.js";

export interface ReplayMoment {
  id: string;
  label: string;
  start_event_idx: number;
  end_event_idx: number;
}

interface TurnBoundary {
  idx: number;
  turn: number;
}

function buildTurnBoundaries(events: ReplayEvent[]): TurnBoundary[] {
  const boundaries: TurnBoundary[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type === "TurnStarted" && typeof ev.turn === "number") {
      boundaries.push({ idx: i, turn: ev.turn });
    }
  }
  return boundaries;
}

export function detectMoments(events: ReplayEvent[]): ReplayMoment[] {
  if (events.length === 0) {
    return [];
  }

  const boundaries = buildTurnBoundaries(events);
  const moments: ReplayMoment[] = [];

  if (boundaries.length === 0) {
    return [
      {
        id: "moment-full-replay",
        label: "Full replay",
        start_event_idx: 0,
        end_event_idx: Math.max(0, events.length - 1),
      },
    ];
  }

  if (boundaries[0].idx > 0) {
    moments.push({
      id: "moment-pre-game",
      label: "Match setup",
      start_event_idx: 0,
      end_event_idx: boundaries[0].idx - 1,
    });
  }

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    const endIdx = nextBoundary ? nextBoundary.idx - 1 : events.length - 1;
    moments.push({
      id: `moment-turn-${boundary.turn}`,
      label: `Turn ${boundary.turn}`,
      start_event_idx: boundary.idx,
      end_event_idx: endIdx,
    });
  }

  return moments;
}
