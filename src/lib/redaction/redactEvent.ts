/**
 * Server-side redaction gate.
 *
 * A pure function that strips private information from match events before
 * they reach spectators over SSE.  This is the single source of truth for
 * "what can a spectator see?" and is importable from both server and client
 * contexts.
 *
 * Convention: any key whose name starts with `_private` (e.g. `_private`,
 * `_privateRemainingResources`) is considered sensitive and is recursively
 * removed from the event payload in spectator-safe modes.
 */

import type { MatchEvent, JsonValue } from "../../contract/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchPhase = "live" | "post_match" | "complete" | "incomplete";

export interface ModeProfile {
  visibility: {
    spectatorPolicy: "live_safe" | "post_match_reveal" | "always_full";
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively strip all keys starting with `_private` from a value tree.
 * Returns a new deep-cloned structure and a flag indicating whether anything
 * was stripped.
 */
function stripPrivateKeys(value: unknown): { result: unknown; stripped: boolean } {
  if (Array.isArray(value)) {
    let anyStripped = false;
    const arr = value.map((item) => {
      const { result, stripped } = stripPrivateKeys(item);
      if (stripped) {
        anyStripped = true;
      }
      return result;
    });
    return { result: arr, stripped: anyStripped };
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    let anyStripped = false;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith("_private")) {
        anyStripped = true;
        continue;
      }
      const { result, stripped } = stripPrivateKeys(val);
      if (stripped) {
        anyStripped = true;
      }
      out[key] = result;
    }
    return { result: out, stripped: anyStripped };
  }

  return { result: value, stripped: false };
}

/**
 * Check whether a value is a non-null, non-array plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Server-side redaction gate: strips private information from match events
 * before they reach spectators over SSE.
 *
 * Returns a redacted **copy** of the event — never mutates the input.
 *
 * Default-safe: if `modeProfile` is `null` / `undefined`, treats as
 * `live_safe`.  For MVP, all phases and both `live_safe` / `post_match_reveal`
 * policies strip `_private`-prefixed keys (conservative approach).
 */
export function redactEvent(
  event: MatchEvent,
  modeProfile: ModeProfile | null | undefined,
  _matchPhase: MatchPhase,
): MatchEvent {
  // Resolve policy — default to live_safe when modeProfile is missing
  const policy = modeProfile?.visibility?.spectatorPolicy ?? "live_safe";

  // always_full: no redaction, but still return a copy to prevent mutation
  if (policy === "always_full") {
    return structuredClone(event);
  }

  // For live_safe and post_match_reveal (MVP: both strip _private for all phases):
  // Strip all _private-prefixed keys from the entire event (also deep clones).
  const { result } = stripPrivateKeys(event);
  const redacted = result as MatchEvent;

  // ObservationEmitted special case: if observation became an empty object
  // after stripping (i.e. all keys were private), replace with a placeholder
  // so spectators still see turn rhythm in the timeline.
  if (redacted.type === "ObservationEmitted") {
    const strippedObs = redacted.observation;
    if (isPlainObject(strippedObs) && Object.keys(strippedObs).length === 0) {
      // Only add placeholder if the original actually had keys that were stripped.
      // A genuinely empty observation {} stays empty.
      if (event.type === "ObservationEmitted") {
        const originalObs = event.observation;
        if (isPlainObject(originalObs) && Object.keys(originalObs).length > 0) {
          redacted.observation = { redacted: true } as JsonValue;
        }
      }
    }
  }

  return redacted;
}
