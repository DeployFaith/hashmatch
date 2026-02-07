/**
 * Commentary parser and model for the replay viewer.
 *
 * Parses a user-provided `commentary.json` file into a validated list of
 * commentary entries.  Entries bind to either a Moment ID or an explicit
 * event-index range.  Invalid entries are silently dropped (warnings are
 * collected for UI display).
 *
 * This module is offline-only: no network calls, no external APIs.
 */

import type { MomentEventRangeMap, ReplayMoment } from "./detectMoments.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommentarySeverity = "hype" | "analysis" | "ref" | "info";

/** A commentary entry bound to a moment ID. */
export interface MomentBoundEntry {
  kind: "moment";
  id: string;
  momentId: string;
  speaker?: string;
  text: string;
  severity: CommentarySeverity;
  tags: string[];
  createdAt?: string;
}

/** A commentary entry bound to an explicit event index range. */
export interface RangeBoundEntry {
  kind: "range";
  id: string;
  startEventIdx: number;
  endEventIdx: number;
  speaker?: string;
  text: string;
  severity: CommentarySeverity;
  tags: string[];
  createdAt?: string;
}

export type CommentaryEntry = MomentBoundEntry | RangeBoundEntry;

export interface CommentaryWarning {
  index: number;
  message: string;
}

export interface CommentaryFile {
  version: number;
  matchId?: string;
  entries: CommentaryEntry[];
  warnings: CommentaryWarning[];
}

// ---------------------------------------------------------------------------
// Load status
// ---------------------------------------------------------------------------

export type CommentaryLoadStatus = "none" | "loaded" | "error";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const DEFAULT_SEVERITY: CommentarySeverity = "info";

const VALID_SEVERITIES = new Set<string>(["hype", "analysis", "ref", "info"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSeverity(v: unknown): CommentarySeverity {
  if (typeof v === "string" && VALID_SEVERITIES.has(v)) {
    return v as CommentarySeverity;
  }
  return DEFAULT_SEVERITY;
}

function parseTags(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((t): t is string => typeof t === "string");
}

/**
 * Parse and validate a commentary.json file from raw text.
 *
 * Invalid entries are skipped with warnings collected.  The resulting entries
 * are deterministically sorted by their effective start event index.
 */
export function parseCommentaryFile(
  text: string,
  moments: ReplayMoment[],
  eventCount: number,
  momentRanges: MomentEventRangeMap,
): CommentaryFile {
  const warnings: CommentaryWarning[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      version: 1,
      entries: [],
      warnings: [{ index: -1, message: "Invalid JSON" }],
    };
  }

  if (!isObject(parsed)) {
    return {
      version: 1,
      entries: [],
      warnings: [{ index: -1, message: "Expected a JSON object at top level" }],
    };
  }

  const version = typeof parsed.version === "number" ? parsed.version : 1;
  const matchId = typeof parsed.matchId === "string" ? parsed.matchId : undefined;

  if (!Array.isArray(parsed.entries)) {
    return {
      version,
      matchId,
      entries: [],
      warnings: [{ index: -1, message: "Missing or invalid 'entries' array" }],
    };
  }

  const momentMap = new Map<string, ReplayMoment>();
  for (const m of moments) {
    momentMap.set(m.id, m);
  }

  const maxIdx = Math.max(0, eventCount - 1);
  const entries: CommentaryEntry[] = [];

  for (let i = 0; i < (parsed.entries as unknown[]).length; i++) {
    const raw = (parsed.entries as unknown[])[i];
    if (!isObject(raw)) {
      warnings.push({ index: i, message: "Entry is not a JSON object" });
      continue;
    }

    // text is required
    if (typeof raw.text !== "string" || raw.text.trim() === "") {
      warnings.push({ index: i, message: "Missing or empty 'text' field" });
      continue;
    }

    const entryId =
      typeof raw.id === "string" ? raw.id : `commentary-${i}`;
    const speaker = typeof raw.speaker === "string" ? raw.speaker : undefined;
    const severity = parseSeverity(raw.severity);
    const tags = parseTags(raw.tags);
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : undefined;

    // Prefer momentId if present
    if (typeof raw.momentId === "string") {
      const moment = momentMap.get(raw.momentId);
      if (!moment) {
        warnings.push({
          index: i,
          message: `Unknown momentId '${raw.momentId}'`,
        });
        continue;
      }
      entries.push({
        kind: "moment",
        id: entryId,
        momentId: raw.momentId,
        speaker,
        text: raw.text,
        severity,
        tags,
        createdAt,
      });
      continue;
    }

    // Range-bound entry
    if (typeof raw.startEventIdx === "number" && typeof raw.endEventIdx === "number") {
      const start = Math.max(0, Math.min(raw.startEventIdx, maxIdx));
      const end = Math.max(start, Math.min(raw.endEventIdx, maxIdx));
      entries.push({
        kind: "range",
        id: entryId,
        startEventIdx: start,
        endEventIdx: end,
        speaker,
        text: raw.text,
        severity,
        tags,
        createdAt,
      });
      continue;
    }

    warnings.push({
      index: i,
      message: "Entry must have 'momentId' or both 'startEventIdx' and 'endEventIdx'",
    });
  }

  // Deterministic sort: by effective start index, then by id as stable tie-breaker
  const sorted = sortCommentaryEntries(entries, momentMap, momentRanges);

  return { version, matchId, entries: sorted, warnings };
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** Get the effective start event index for a commentary entry. */
export function getEntryStartIdx(
  entry: CommentaryEntry,
  momentMap: Map<string, ReplayMoment>,
  momentRanges: MomentEventRangeMap,
): number {
  if (entry.kind === "moment") {
    const moment = momentMap.get(entry.momentId);
    if (!moment) {
      return 0;
    }
    const range = momentRanges.get(moment.id);
    return range ? range.startEventIdx : 0;
  }
  return entry.startEventIdx;
}

/** Get the effective end event index for a commentary entry. */
export function getEntryEndIdx(
  entry: CommentaryEntry,
  momentMap: Map<string, ReplayMoment>,
  momentRanges: MomentEventRangeMap,
  fallbackEndIdx: number,
): number {
  if (entry.kind === "moment") {
    const moment = momentMap.get(entry.momentId);
    if (!moment) {
      return fallbackEndIdx;
    }
    const range = momentRanges.get(moment.id);
    return range ? range.endEventIdx : fallbackEndIdx;
  }
  return entry.endEventIdx;
}

function sortCommentaryEntries(
  entries: CommentaryEntry[],
  momentMap: Map<string, ReplayMoment>,
  momentRanges: MomentEventRangeMap,
): CommentaryEntry[] {
  return [...entries].sort((a, b) => {
    const aStart = getEntryStartIdx(a, momentMap, momentRanges);
    const bStart = getEntryStartIdx(b, momentMap, momentRanges);
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    // Stable tie-breaker: by id
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Selectors — used by UI to find relevant commentary for the current state
// ---------------------------------------------------------------------------

/**
 * Return commentary entries visible at the given playhead position.
 *
 * Safety rules:
 * - When `revealSpoilers` is false, entries whose effective start index is
 *   beyond the current playhead are hidden (anti-spoiler gating).
 * - When `revealSpoilers` is true, all entries are shown.
 */
export function getVisibleCommentary(
  entries: CommentaryEntry[],
  playheadIdx: number,
  moments: ReplayMoment[],
  momentRanges: MomentEventRangeMap,
  revealSpoilers: boolean,
): CommentaryEntry[] {
  const momentMap = new Map<string, ReplayMoment>();
  for (const m of moments) {
    momentMap.set(m.id, m);
  }

  return entries.filter((entry) => {
    const startIdx = getEntryStartIdx(entry, momentMap, momentRanges);

    // Anti-spoiler gating: don't show commentary for future events
    if (!revealSpoilers && startIdx > playheadIdx) {
      return false;
    }

    return true;
  });
}

/**
 * Return commentary entries relevant to a specific moment.
 *
 * Includes both:
 * - Entries directly bound to the moment (by momentId)
 * - Range entries whose range overlaps the moment's event range
 */
export function getCommentaryForMoment(
  entries: CommentaryEntry[],
  moment: ReplayMoment,
  moments: ReplayMoment[],
  momentRanges: MomentEventRangeMap,
  playheadIdx: number,
  revealSpoilers: boolean,
): CommentaryEntry[] {
  const visible = getVisibleCommentary(entries, playheadIdx, moments, momentRanges, revealSpoilers);

  return visible.filter((entry) => {
    if (entry.kind === "moment") {
      return entry.momentId === moment.id;
    }
    // Range overlap check
    const range = momentRanges.get(moment.id);
    if (!range) {
      return false;
    }
    return entry.startEventIdx <= range.endEventIdx && entry.endEventIdx >= range.startEventIdx;
  });
}

/**
 * Return commentary entries active at a specific event index.
 *
 * Includes entries whose range contains the given index.
 */
export function getCommentaryAtIndex(
  entries: CommentaryEntry[],
  eventIdx: number,
  moments: ReplayMoment[],
  momentRanges: MomentEventRangeMap,
  playheadIdx: number,
  revealSpoilers: boolean,
): CommentaryEntry[] {
  const visible = getVisibleCommentary(entries, playheadIdx, moments, momentRanges, revealSpoilers);

  const momentMap = new Map<string, ReplayMoment>();
  for (const m of moments) {
    momentMap.set(m.id, m);
  }

  return visible.filter((entry) => {
    const startIdx = getEntryStartIdx(entry, momentMap, momentRanges);
    const endIdx = getEntryEndIdx(entry, momentMap, momentRanges, eventIdx);
    return eventIdx >= startIdx && eventIdx <= endIdx;
  });
}
