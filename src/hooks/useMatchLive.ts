"use client";

import { useEffect, useRef, useCallback, useState, useSyncExternalStore } from "react";
import {
  createLiveEventSource,
  type MatchEventSource,
  type MatchEventSourceSnapshot,
} from "@/lib/replay/eventSource";
import type {
  LiveMatchStatus,
  LiveMatchStatusResponse,
  SSEMatchStatusData,
  SSEMatchCompleteData,
} from "@/lib/matches/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The viewer-facing lifecycle state derived from status polling + SSE. */
export type LiveViewerState =
  | "waiting"
  | "connecting"
  | "live"
  | "reconnecting"
  | "completed"
  | "crashed"
  | "unknown";

export interface UseMatchLiveResult {
  /** Current viewer state. */
  state: LiveViewerState;
  /** Snapshot of SSE events accumulated so far (null until SSE connects). */
  snapshot: MatchEventSourceSnapshot | null;
  /** Latest polled status from the API. */
  apiStatus: LiveMatchStatus;
  /** Number of events received so far. */
  eventCount: number;
  /** Progress data from the latest match_status heartbeat. */
  liveStatus: SSEMatchStatusData | null;
  /** Completion data from the match_complete event. */
  completeInfo: SSEMatchCompleteData | null;
  /** Match metadata from the status endpoint. */
  matchMeta: LiveMatchStatusResponse | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_POLL_INTERVAL_MS = 1500;
const WAITING_POLL_INTERVAL_MS = 2000;
const RECONNECT_INDICATOR_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of a live match viewer:
 * - Opens an SSE connection to stream match events
 * - Polls the status API to detect completion/crash
 * - Transitions to terminal state when the match ends
 * - Handles the "waiting" state by polling until the match starts
 *
 * Returns the current viewer state, accumulated events, and API status.
 */
export function useMatchLive(matchId: string, initialStatus: LiveMatchStatus): UseMatchLiveResult {
  const sourceRef = useRef<MatchEventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [apiStatus, setApiStatus] = useState<LiveMatchStatus>(initialStatus);
  const [matchMeta, setMatchMeta] = useState<LiveMatchStatusResponse | null>(null);
  const [viewerState, setViewerState] = useState<LiveViewerState>(
    initialStatus === "running"
      ? "connecting"
      : initialStatus === "waiting"
        ? "waiting"
        : mapStatusToState(initialStatus),
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

  // -- Connect SSE when status becomes "running" ----------------------------

  const connectSSE = useCallback((mid: string) => {
    if (sourceRef.current) {
      return;
    }
    const source = createLiveEventSource(mid);
    sourceRef.current = source;
    setViewerState("live");
  }, []);

  // -- Lifecycle effect: polling + SSE management ----------------------------

  useEffect(() => {
    let cancelled = false;

    const pollStatus = async (): Promise<LiveMatchStatusResponse | null> => {
      try {
        const res = await fetch(`/api/matches/${matchId}/status`);
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as LiveMatchStatusResponse;
      } catch {
        return null;
      }
    };

    const startPolling = (intervalMs: number) => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      pollingRef.current = setInterval(async () => {
        if (cancelled) {
          return;
        }
        const data = await pollStatus();
        if (!data || cancelled) {
          return;
        }

        setMatchMeta(data);
        setApiStatus(data.status);

        if (data.status === "running" && !sourceRef.current) {
          // Transition from waiting to running — open SSE
          connectSSE(matchId);
          // Switch to faster polling for running matches
          startPolling(STATUS_POLL_INTERVAL_MS);
        } else if (data.status === "finished") {
          setViewerState("completed");
          if (sourceRef.current) {
            sourceRef.current.close();
            sourceRef.current = null;
          }
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }, intervalMs);
    };

    // Determine initial behavior based on status
    if (initialStatus === "waiting") {
      startPolling(WAITING_POLL_INTERVAL_MS);
    } else if (initialStatus === "running") {
      connectSSE(matchId);
      startPolling(STATUS_POLL_INTERVAL_MS);
      // Run initial poll
      void pollStatus().then((data) => {
        if (!cancelled && data) {
          setMatchMeta(data);
          setApiStatus(data.status);
        }
      });
    } else if (initialStatus === "finished") {
      setViewerState("completed");
    }

    return () => {
      cancelled = true;
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [matchId, initialStatus, connectSSE]);

  // -- Derive final state from SSE snapshot ----------------------------------

  const effectiveState = deriveViewerState(viewerState, snapshot?.status ?? null, apiStatus);

  return {
    state: effectiveState,
    snapshot,
    apiStatus,
    eventCount: snapshot?.events.length ?? 0,
    liveStatus: snapshot?.liveStatus ?? null,
    completeInfo: snapshot?.completeInfo ?? null,
    matchMeta,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map frozen-contract status to viewer state. Exported for testing. */
export function mapStatusToState(status: LiveMatchStatus): LiveViewerState {
  switch (status) {
    case "waiting":
      return "waiting";
    case "running":
      return "live";
    case "finished":
      return "completed";
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
  apiStatus: LiveMatchStatus,
): LiveViewerState {
  // SSE signalled completion
  if (sseStatus === "complete") {
    return "completed";
  }
  // SSE error + API says finished
  if (sseStatus === "error" && apiStatus === "finished") {
    return "completed";
  }
  return baseState;
}

export { RECONNECT_INDICATOR_DELAY_MS };
