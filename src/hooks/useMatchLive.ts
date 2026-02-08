"use client";

import { useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import {
  createLiveEventSource,
  type MatchEventSource,
  type MatchEventSourceSnapshot,
} from "@/lib/replay/eventSource";
import type { MatchRunState, MatchRunStatusResponse } from "@/lib/matches/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The viewer-facing lifecycle state derived from status polling + SSE. */
export type LiveViewerState = "connecting" | "live" | "completed" | "crashed" | "unknown";

export interface UseMatchLiveResult {
  /** Current viewer state. */
  state: LiveViewerState;
  /** Snapshot of SSE events accumulated so far (null until SSE connects). */
  snapshot: MatchEventSourceSnapshot | null;
  /** Latest polled status from the API. */
  apiStatus: MatchRunState;
  /** Number of events received so far. */
  eventCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_POLL_INTERVAL_MS = 1500;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of a live match viewer:
 * - Opens an SSE connection to stream match events
 * - Polls the status API to detect completion/crash
 * - Transitions to terminal state when the match ends
 *
 * Returns the current viewer state, accumulated events, and API status.
 */
export function useMatchLive(matchId: string, initialStatus: MatchRunState): UseMatchLiveResult {
  const sourceRef = useRef<MatchEventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiStatusRef = useRef<MatchRunState>(initialStatus);
  const derivedStateRef = useRef<LiveViewerState>(
    initialStatus === "running" ? "connecting" : mapStatusToState(initialStatus),
  );

  // -- SSE snapshot via useSyncExternalStore ---------------------------------

  const subscribe = useCallback((onStoreChange: () => void) => {
    const source = sourceRef.current;
    if (!source) {
      return () => {};
    }
    return source.subscribe(onStoreChange);
  }, []);

  const getSnapshot = useCallback((): MatchEventSourceSnapshot | null => {
    return sourceRef.current?.getSnapshot() ?? null;
  }, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // -- Lifecycle effect: SSE + status polling --------------------------------

  useEffect(() => {
    // Only open SSE for running matches
    if (initialStatus !== "running") {
      apiStatusRef.current = initialStatus;
      derivedStateRef.current = mapStatusToState(initialStatus);
      return;
    }

    // Open SSE connection
    const source = createLiveEventSource(matchId);
    sourceRef.current = source;
    derivedStateRef.current = "live";

    // Poll status API
    const poll = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}/status`);
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as MatchRunStatusResponse;
        apiStatusRef.current = data.status;

        if (data.status === "completed" || data.status === "crashed") {
          derivedStateRef.current = mapStatusToState(data.status);
          // Close SSE — the match is done
          source.close();
          sourceRef.current = null;
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch {
        // Network error — keep polling
      }
    };

    pollingRef.current = setInterval(poll, STATUS_POLL_INTERVAL_MS);
    // Run an initial poll immediately
    void poll();

    return () => {
      source.close();
      sourceRef.current = null;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [matchId, initialStatus]);

  // -- Derive state from SSE snapshot + API status ---------------------------

  const state = deriveViewerState(
    derivedStateRef.current,
    snapshot?.status ?? null,
    apiStatusRef.current,
  );

  return {
    state,
    snapshot,
    apiStatus: apiStatusRef.current,
    eventCount: snapshot?.events.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map API status to viewer state. Exported for testing. */
export function mapStatusToState(status: MatchRunState): LiveViewerState {
  switch (status) {
    case "running":
      return "live";
    case "completed":
      return "completed";
    case "crashed":
      return "crashed";
    default:
      return "unknown";
  }
}

/**
 * Derive the effective viewer state from the base state, SSE snapshot status,
 * and the API status. Exported for testing.
 */
export function deriveViewerState(
  baseState: LiveViewerState,
  sseStatus: "loading" | "complete" | "error" | null,
  apiStatus: MatchRunState,
): LiveViewerState {
  if (sseStatus === "complete") {
    return "completed";
  }
  if (sseStatus === "error" && apiStatus === "crashed") {
    return "crashed";
  }
  return baseState;
}
