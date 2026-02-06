export interface CommentaryDoc {
  entries?: CommentaryEntryIn[];
  [key: string]: unknown;
}

export interface CommentaryEntryIn {
  id?: string;
  momentId?: string;
  startEventIdx?: number;
  endEventIdx?: number;
  text?: string;
  speaker?: string;
  severity?: string;
  tags?: string[];
}

export interface CommentaryEntry {
  id?: string;
  momentId?: string;
  startEventIdx?: number;
  endEventIdx?: number;
  anchorStartIdx?: number;
  anchorEndIdx?: number;
  text: string;
  speaker?: string;
  severity?: string;
  tags: string[];
  sourceIndex: number;
}

export interface CommentaryMomentRef {
  id: string;
  startEventIdx: number;
  endEventIdx: number;
}

export interface VisibleCommentaryResult {
  visibleNow: CommentaryEntry[];
  visibleForMoment: (momentId: string) => CommentaryEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((tag): tag is string => typeof tag === "string");
}

function describeEntry(entry: CommentaryEntry): string {
  if (entry.id) {
    return `id "${entry.id}"`;
  }
  return `at index ${entry.sourceIndex}`;
}

export function parseCommentaryJson(
  textOrObj: string | CommentaryDoc | CommentaryEntryIn[] | unknown,
): { entries: CommentaryEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  let payload: unknown = textOrObj;

  if (typeof textOrObj === "string") {
    try {
      payload = JSON.parse(textOrObj) as unknown;
    } catch (error) {
      warnings.push(`Failed to parse commentary JSON: ${(error as Error).message}`);
      return { entries: [], warnings };
    }
  }

  let rawEntries: unknown[] = [];
  if (Array.isArray(payload)) {
    rawEntries = payload;
  } else if (isRecord(payload) && Array.isArray(payload.entries)) {
    rawEntries = payload.entries;
  } else if (payload !== undefined && payload !== null) {
    warnings.push("Commentary JSON did not contain an entries array.");
  }

  const entries: CommentaryEntry[] = [];
  rawEntries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      warnings.push(`Commentary entry at index ${index} is not an object.`);
      return;
    }

    const text = typeof entry.text === "string" ? entry.text : undefined;
    const momentId = typeof entry.momentId === "string" ? entry.momentId : undefined;
    const startEventIdx = isFiniteNumber(entry.startEventIdx) ? entry.startEventIdx : undefined;
    const endEventIdx = isFiniteNumber(entry.endEventIdx) ? entry.endEventIdx : undefined;
    const speaker = typeof entry.speaker === "string" ? entry.speaker : undefined;
    const severity = typeof entry.severity === "string" ? entry.severity : undefined;
    const id = typeof entry.id === "string" ? entry.id : undefined;
    const tags = normalizeTags(entry.tags);

    if (!text) {
      warnings.push(`Commentary entry at index ${index} is missing text.`);
      return;
    }

    if (!momentId && (startEventIdx === undefined || endEventIdx === undefined)) {
      warnings.push(
        `Commentary entry at index ${index} is missing momentId or range fields.`,
      );
      return;
    }

    entries.push({
      id,
      momentId,
      startEventIdx,
      endEventIdx,
      text,
      speaker,
      severity,
      tags,
      sourceIndex: index,
    });
  });

  return { entries, warnings };
}

export function normalizeAndSortCommentary(
  entries: CommentaryEntry[],
  moments: CommentaryMomentRef[],
  eventsLength: number,
): CommentaryEntry[];
export function normalizeAndSortCommentary(
  entries: CommentaryEntry[],
  moments: CommentaryMomentRef[],
  eventsLength: number,
  warnings: string[],
): CommentaryEntry[];
export function normalizeAndSortCommentary(
  entries: CommentaryEntry[],
  moments: CommentaryMomentRef[],
  eventsLength: number,
  warnings: string[] = [],
): CommentaryEntry[] {
  const momentMap = new Map<string, CommentaryMomentRef>();
  moments.forEach((moment) => {
    momentMap.set(moment.id, moment);
  });

  const maxIdx = Math.max(0, eventsLength - 1);
  const clamp = (value: number) => Math.min(Math.max(value, 0), maxIdx);

  const normalized = entries.flatMap((entry) => {
    if (entry.momentId) {
      const moment = momentMap.get(entry.momentId);
      if (!moment) {
        warnings.push(
          `Commentary entry ${describeEntry(entry)} references unknown momentId "${entry.momentId}".`,
        );
        return [];
      }
      return [
        {
          ...entry,
          startEventIdx: moment.startEventIdx,
          endEventIdx: moment.endEventIdx,
          anchorStartIdx: moment.startEventIdx,
          anchorEndIdx: moment.endEventIdx,
        },
      ];
    }

    if (entry.startEventIdx === undefined || entry.endEventIdx === undefined) {
      warnings.push(`Commentary entry ${describeEntry(entry)} is missing a range.`);
      return [];
    }

    const clampedStart = clamp(entry.startEventIdx);
    const clampedEnd = clamp(entry.endEventIdx);
    const startEventIdx = Math.min(clampedStart, clampedEnd);
    const endEventIdx = Math.max(clampedStart, clampedEnd);

    if (entry.endEventIdx < entry.startEventIdx) {
      warnings.push(
        `Commentary entry ${describeEntry(entry)} had inverted range; normalized to ${startEventIdx}-${endEventIdx}.`,
      );
    }

    return [
      {
        ...entry,
        startEventIdx,
        endEventIdx,
        anchorStartIdx: startEventIdx,
        anchorEndIdx: endEventIdx,
      },
    ];
  });

  return [...normalized].sort((a, b) => {
    const aStart = a.anchorStartIdx ?? a.startEventIdx ?? 0;
    const bStart = b.anchorStartIdx ?? b.startEventIdx ?? 0;
    if (aStart !== bStart) {
      return aStart - bStart;
    }

    if (a.id && b.id) {
      return a.id.localeCompare(b.id);
    }

    if (!a.id && !b.id) {
      return a.sourceIndex - b.sourceIndex;
    }

    const aKey = a.id ?? String(a.sourceIndex);
    const bKey = b.id ?? String(b.sourceIndex);
    if (aKey < bKey) {
      return -1;
    }
    if (aKey > bKey) {
      return 1;
    }
    return 0;
  });
}

export function getVisibleCommentary(params: {
  entries: CommentaryEntry[];
  moments: CommentaryMomentRef[];
  playheadIdx: number;
  revealSpoilers: boolean;
}): VisibleCommentaryResult {
  const { entries, moments, playheadIdx, revealSpoilers } = params;
  const momentMap = new Map<string, CommentaryMomentRef>();
  moments.forEach((moment) => {
    momentMap.set(moment.id, moment);
  });

  const entryStartIdx = (entry: CommentaryEntry): number | null => {
    if (entry.momentId) {
      const moment = momentMap.get(entry.momentId);
      return moment ? moment.startEventIdx : null;
    }
    if (entry.anchorStartIdx !== undefined) {
      return entry.anchorStartIdx;
    }
    if (entry.startEventIdx !== undefined) {
      return entry.startEventIdx;
    }
    return null;
  };

  const isVisible = (entry: CommentaryEntry): boolean => {
    if (revealSpoilers) {
      return true;
    }
    const startIdx = entryStartIdx(entry);
    if (startIdx === null) {
      return false;
    }
    return playheadIdx >= startIdx;
  };

  const visibleNow = entries.filter((entry) => isVisible(entry));

  const visibleForMoment = (momentId: string): CommentaryEntry[] => {
    const moment = momentMap.get(momentId);
    if (!moment) {
      return [];
    }
    return entries.filter((entry) => {
      if (entry.momentId === momentId) {
        return isVisible(entry);
      }
      const startIdx = entry.startEventIdx ?? entry.anchorStartIdx;
      const endIdx = entry.endEventIdx ?? entry.anchorEndIdx ?? startIdx;
      if (startIdx === undefined || endIdx === undefined) {
        return false;
      }
      const overlaps = startIdx <= moment.endEventIdx && endIdx >= moment.startEventIdx;
      return overlaps && isVisible(entry);
    });
  };

  return { visibleNow, visibleForMoment };
}
