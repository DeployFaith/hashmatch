/**
 * MatchEventSource seam — abstracts where replay events come from.
 *
 * The UI consumes a `MatchEventSource` without caring whether events were
 * loaded from a file (this PR) or are arriving over a live stream (future).
 *
 * For file-backed replays the source is created via `createFileEventSource`,
 * which synchronously parses the JSONL text and immediately transitions to
 * `"complete"` status.  The `subscribe` callback is a no-op since no further
 * updates will arrive, but consumers should still call it so the same code
 * path works for both file and live sources.
 */

import { parseJsonl } from "./parseJsonl";
import type { ReplayEvent, ParseError } from "./parseJsonl";
import type { SSEMatchStatusData, SSEMatchCompleteData } from "@/lib/matches/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lifecycle status of an event source. */
export type EventSourceStatus = "loading" | "complete" | "error";

/** Discriminator for the kind of source. */
export type EventSourceKind = "file" | "live";

/** Immutable point-in-time snapshot of events + status. */
export interface MatchEventSourceSnapshot {
  readonly events: ReplayEvent[];
  readonly errors: ParseError[];
  readonly status: EventSourceStatus;
  /** Progress info from SSE match_status heartbeats (live sources only). */
  readonly liveStatus?: SSEMatchStatusData;
  /** Completion info from SSE match_complete event (live sources only). */
  readonly completeInfo?: SSEMatchCompleteData;
}

/**
 * A source of match events that the UI can subscribe to.
 *
 * Consumers call `getSnapshot()` to read current state and `subscribe()` to
 * be notified when new events arrive (relevant for live sources).
 *
 * This API is intentionally compatible with React's `useSyncExternalStore`.
 */
export interface MatchEventSource {
  /** Discriminator for the kind of source. */
  readonly kind: EventSourceKind;

  /** Return the current snapshot (events + status). */
  getSnapshot(): MatchEventSourceSnapshot;

  /**
   * Register a listener that is called whenever the snapshot changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void;

  /** Release any resources held by the source. */
  close(): void;
}

// ---------------------------------------------------------------------------
// FileEventSource
// ---------------------------------------------------------------------------

/**
 * Create a file-backed event source from already-read JSONL text.
 *
 * Parsing is synchronous — the returned source starts in `"complete"` (or
 * `"error"` if parsing yielded zero events and at least one error).
 */
export function createFileEventSource(text: string): MatchEventSource {
  const result = parseJsonl(text);

  const hasEvents = result.events.length > 0;
  const hasOnlyErrors = !hasEvents && result.errors.length > 0;

  const snapshot: MatchEventSourceSnapshot = Object.freeze({
    events: result.events,
    errors: result.errors,
    status: hasOnlyErrors ? "error" : "complete",
  });

  return {
    kind: "file",
    getSnapshot: () => snapshot,
    // File sources are immediately complete; subscribe is a no-op.
    subscribe: () => () => {},
    close: () => {},
  };
}

// ---------------------------------------------------------------------------
// LiveEventSource
// ---------------------------------------------------------------------------

function coerceReplayEvent(raw: unknown): ReplayEvent | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.type !== "string" ||
    typeof obj.seq !== "number" ||
    typeof obj.matchId !== "string"
  ) {
    return null;
  }
  return {
    type: obj.type,
    seq: obj.seq,
    matchId: obj.matchId,
    turn: typeof obj.turn === "number" ? obj.turn : undefined,
    agentId: typeof obj.agentId === "string" ? obj.agentId : undefined,
    raw: obj,
  };
}

function parseErrorMessage(data: string | undefined): string {
  if (!data) {
    return "Live stream error.";
  }
  try {
    const parsed = JSON.parse(data) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim() !== "") {
      return parsed.message;
    }
  } catch {
    // Ignore JSON parsing failure.
  }
  return data;
}

export function createLiveEventSource(matchId: string): MatchEventSource {
  const listeners = new Set<() => void>();
  let events: ReplayEvent[] = [];
  let errors: ParseError[] = [];
  let status: EventSourceStatus = "loading";
  let liveStatus: SSEMatchStatusData | undefined;
  let completeInfo: SSEMatchCompleteData | undefined;
  /** Track the highest seq seen to deduplicate on reconnect. */
  let maxSeqSeen = -1;
  let snapshot: MatchEventSourceSnapshot = Object.freeze({
    events,
    errors,
    status,
  });
  let closed = false;

  const source = new EventSource(`/api/matches/${matchId}/events`);

  const notify = () => {
    if (closed) {
      return;
    }
    snapshot = Object.freeze({
      events: [...events],
      errors: [...errors],
      status,
      liveStatus,
      completeInfo,
    });
    listeners.forEach((listener) => listener());
  };

  const pushError = (message: string) => {
    errors = [...errors, { line: 0, message }];
  };

  source.addEventListener("match_event", (evt) => {
    if (closed) {
      return;
    }
    const message = evt as MessageEvent<string>;
    try {
      const parsed = JSON.parse(message.data);
      const event = coerceReplayEvent(parsed);
      if (!event) {
        pushError("Invalid match_event payload.");
        notify();
        return;
      }
      // Deduplicate: skip events with seq <= maxSeqSeen (reconnect replay)
      if (event.seq <= maxSeqSeen) {
        return;
      }
      maxSeqSeen = event.seq;
      events = [...events, event];
      notify();
    } catch {
      pushError("Failed to parse match_event payload.");
      notify();
    }
  });

  source.addEventListener("match_status", (evt) => {
    if (closed) {
      return;
    }
    const message = evt as MessageEvent<string>;
    try {
      const parsed = JSON.parse(message.data) as SSEMatchStatusData;
      liveStatus = parsed;
      notify();
    } catch {
      pushError("Failed to parse match_status payload.");
      notify();
    }
  });

  source.addEventListener("match_complete", (evt) => {
    if (closed) {
      return;
    }
    const message = evt as MessageEvent<string>;
    try {
      const parsed = JSON.parse(message.data) as SSEMatchCompleteData;
      completeInfo = parsed;
    } catch {
      pushError("Failed to parse match_complete payload.");
    }
    status = "complete";
    notify();
    source.close();
    closed = true;
  });

  source.addEventListener("error", (evt) => {
    if (closed) {
      return;
    }
    if (evt instanceof MessageEvent) {
      pushError(parseErrorMessage(evt.data));
      status = "error";
      notify();
      source.close();
      closed = true;
    }
  });

  source.onerror = () => {
    if (closed) {
      return;
    }
    if (source.readyState === EventSource.CLOSED) {
      pushError("Live stream disconnected.");
      status = "error";
      notify();
      closed = true;
    }
  };

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
      source.close();
      listeners.clear();
    },
  };
}
