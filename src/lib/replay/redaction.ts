/**
 * Redaction layer for replay events.
 *
 * Receives (event, viewerMode, revealSpoilersFlag) and returns a safe render
 * model.  Default spectator mode never shows private agent observations,
 * hidden state, or match outcome details.
 */

import type { ReplayEvent } from "./parseJsonl";

// ---------------------------------------------------------------------------
// Viewer modes
// ---------------------------------------------------------------------------

/** The viewer mode controls baseline visibility. */
export type ViewerMode = "spectator" | "postMatch" | "director";

/** Options passed into the redaction function. */
export interface RedactionOptions {
  /** Current viewer mode. Defaults to "spectator". */
  mode: ViewerMode;
  /** Whether the user has explicitly toggled spoiler reveal. */
  revealSpoilers: boolean;
}

// ---------------------------------------------------------------------------
// Redaction result
// ---------------------------------------------------------------------------

/** The safe render model returned by the redaction layer. */
export interface RedactedEvent {
  /** Original event type. */
  type: string;
  /** Sequence number. */
  seq: number;
  /** Match identifier. */
  matchId: string;
  /** Turn number (if present). */
  turn?: number;
  /** Agent identifier (if present). */
  agentId?: string;
  /** Whether any field in displayRaw was redacted. */
  isRedacted: boolean;
  /** A human-readable summary safe for display. */
  summary: string;
  /** The raw object with sensitive fields replaced by placeholders. */
  displayRaw: Record<string, unknown>;
  /** The original raw object (only populated when spoilers are revealed). */
  fullRaw: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REDACTED_PLACEHOLDER = "[hidden — enable spoilers to reveal]";

function isPrivateEventType(type: string): boolean {
  return type === "ObservationEmitted";
}

function isSpoilerEventType(type: string): boolean {
  return type === "MatchEnded";
}

/** Deep-clone a plain object. */
function cloneRaw(raw: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}

/**
 * Determine whether an event's payload should be redacted given the current
 * viewer settings.
 */
function shouldRedact(event: ReplayEvent, opts: RedactionOptions): boolean {
  // Director mode: never redact.
  if (opts.mode === "director") {
    return false;
  }

  // If spoilers are explicitly revealed, don't redact.
  if (opts.revealSpoilers) {
    return false;
  }

  // Spoiler events (MatchEnded) are always redacted unless spoilers revealed.
  if (isSpoilerEventType(event.type)) {
    return true;
  }

  // Private observations are redacted in spectator mode.
  if (opts.mode === "spectator" && isPrivateEventType(event.type)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Redaction strategies per event type
// ---------------------------------------------------------------------------

function redactObservation(raw: Record<string, unknown>): Record<string, unknown> {
  const redacted = cloneRaw(raw);
  redacted.observation = REDACTED_PLACEHOLDER;
  return redacted;
}

function redactMatchEnded(raw: Record<string, unknown>): Record<string, unknown> {
  const redacted = cloneRaw(raw);
  redacted.scores = REDACTED_PLACEHOLDER;
  if ("details" in redacted) {
    redacted.details = REDACTED_PLACEHOLDER;
  }
  if ("reason" in redacted) {
    redacted.reason = REDACTED_PLACEHOLDER;
  }
  return redacted;
}

function redactEventRaw(event: ReplayEvent): Record<string, unknown> {
  switch (event.type) {
    case "ObservationEmitted":
      return redactObservation(event.raw);
    case "MatchEnded":
      return redactMatchEnded(event.raw);
    default:
      return cloneRaw(event.raw);
  }
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function buildSummary(event: ReplayEvent, redacted: boolean): string {
  const raw = event.raw;
  switch (event.type) {
    case "MatchStarted":
      return `${raw.scenarioName} — ${(raw.agentIds as string[])?.join(" vs ")}`;
    case "TurnStarted":
      return `Turn ${event.turn} started`;
    case "ObservationEmitted":
      return redacted
        ? `Observation → ${event.agentId} [redacted]`
        : `Observation → ${event.agentId}`;
    case "ActionSubmitted":
      return `Action ← ${event.agentId}`;
    case "ActionAdjudicated":
      return `${raw.valid ? "Valid" : "INVALID"} — ${event.agentId}`;
    case "StateUpdated":
      return "State updated";
    case "AgentError":
      return `Error: ${event.agentId}`;
    case "MatchEnded":
      return redacted ? "Match ended [spoiler hidden]" : "Match ended";
    default:
      return `${event.type} (unknown)`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: RedactionOptions = {
  mode: "spectator",
  revealSpoilers: false,
};

/** Redact a single event for safe display. */
export function redactEvent(event: ReplayEvent, opts?: Partial<RedactionOptions>): RedactedEvent {
  const options: RedactionOptions = { ...DEFAULT_OPTIONS, ...opts };
  const redacted = shouldRedact(event, options);

  return {
    type: event.type,
    seq: event.seq,
    matchId: event.matchId,
    turn: event.turn,
    agentId: event.agentId,
    isRedacted: redacted,
    summary: buildSummary(event, redacted),
    displayRaw: redacted ? redactEventRaw(event) : cloneRaw(event.raw),
    fullRaw: options.revealSpoilers || options.mode === "director" ? cloneRaw(event.raw) : null,
  };
}

/** Redact a batch of events. */
export function redactEvents(
  events: ReplayEvent[],
  opts?: Partial<RedactionOptions>,
): RedactedEvent[] {
  return events.map((e) => redactEvent(e, opts));
}
