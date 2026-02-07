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
