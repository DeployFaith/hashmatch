"use client";

import { useMemo, useRef } from "react";
import type { MatchEvent } from "@/contract/types";
import type { ReplayEvent } from "@/lib/replay/parseJsonl";
import type { HeistSceneState } from "@/arena/heist/types";
import { reduceHeistEvent } from "@/arena/heist/reducer";

// ---------------------------------------------------------------------------
// Checkpoint cache: avoids re-reducing from event 0 on every cursor change.
// We cache a snapshot every CHECKPOINT_INTERVAL events so scrubbing backward
// only needs to replay from the nearest prior checkpoint.
// ---------------------------------------------------------------------------

const CHECKPOINT_INTERVAL = 20;

interface Checkpoint {
  index: number; // event index (inclusive) this state represents after folding events[0..index]
  state: HeistSceneState;
}

interface CacheState {
  matchId: string;
  checkpoints: Checkpoint[];
}

/**
 * Convert a tolerant ReplayEvent to the MatchEvent shape expected by the
 * heist reducer. ReplayEvent.raw contains the full parsed JSON object with
 * all original fields, which is a superset of MatchEvent.
 */
function replayEventToMatchEvent(ev: ReplayEvent): MatchEvent {
  return ev.raw as unknown as MatchEvent;
}

/**
 * Detect whether a set of replay events represents a Heist scenario by
 * checking the scenarioName field on the MatchStarted event.
 */
export function isHeistScenario(events: ReplayEvent[]): boolean {
  const started = events.find((e) => e.type === "MatchStarted");
  if (!started) {
    return false;
  }
  const name = started.raw.scenarioName;
  return typeof name === "string" && name === "Heist";
}

/**
 * Hook that computes HeistSceneState at a given cursor index from replay
 * events. Uses an internal checkpoint cache so that scrubbing (especially
 * backward) doesn't re-reduce from index 0 every time.
 *
 * Returns `null` if:
 * - events is empty
 * - cursorIndex < 0
 * - the scenario is not Heist
 */
export function useHeistScene(events: ReplayEvent[], cursorIndex: number): HeistSceneState | null {
  const cacheRef = useRef<CacheState | null>(null);

  return useMemo(() => {
    if (events.length === 0 || cursorIndex < 0) {
      return null;
    }

    const matchId = events[0].matchId;
    const clampedIdx = Math.min(cursorIndex, events.length - 1);

    // Reset cache if matchId changed
    if (!cacheRef.current || cacheRef.current.matchId !== matchId) {
      cacheRef.current = { matchId, checkpoints: [] };
    }

    const cache = cacheRef.current;

    // Find nearest checkpoint at or before clampedIdx
    let startIdx = 0;
    let state: HeistSceneState | undefined;

    for (let i = cache.checkpoints.length - 1; i >= 0; i--) {
      const cp = cache.checkpoints[i];
      if (cp.index <= clampedIdx) {
        startIdx = cp.index + 1;
        state = cp.state;
        break;
      }
    }

    // Reduce from startIdx through clampedIdx
    for (let i = startIdx; i <= clampedIdx; i++) {
      state = reduceHeistEvent(state, replayEventToMatchEvent(events[i]));

      // Store checkpoint at intervals
      if (i > 0 && i % CHECKPOINT_INTERVAL === 0 && state) {
        const existingIdx = cache.checkpoints.findIndex((cp) => cp.index === i);
        if (existingIdx === -1) {
          cache.checkpoints.push({ index: i, state });
          // Keep checkpoints sorted
          cache.checkpoints.sort((a, b) => a.index - b.index);
        }
      }
    }

    return state ?? null;
  }, [events, cursorIndex]);
}
