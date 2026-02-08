import type { MatchSummary } from "../../tournament/types.js";
import type { ReplayMoment } from "./detectMoments.js";

export interface Highlight {
  id: string;
  momentRef: string;
  type: ReplayMoment["type"];
  startSeq: number;
  endSeq: number;
  headline: string;
  description?: string;
  priority: number;
  spoilerLevel: "safe" | "reveals_outcome";
}

export interface HighlightsFile {
  schemaVersion: "1.0.0";
  matchId: string;
  generatedBy: "harness";
  authoritative: false;
  highlights: Highlight[];
  headline?: string;
  subheadline?: string;
}

const HEADLINE_TEMPLATES: Record<ReplayMoment["type"], string> = {
  score_swing: "{agent} surges with a {delta}-point swing",
  lead_change: "Lead change! {agent} takes control",
  comeback: "{agent} erases a {deficit}-point deficit to win",
  blunder: "{agent} stumbles with an invalid move",
  clutch: "{agent} clinches it in the final moments",
  close_call: "Nail-biter: only {margin} points separate the agents",
};

const FALLBACK_HEADLINES: Record<ReplayMoment["type"], string> = {
  score_swing: "Dramatic score swing",
  lead_change: "Lead change shakes up the match",
  comeback: "Stunning comeback seals the win",
  blunder: "Costly misstep in the match",
  clutch: "Clutch finish decides the match",
  close_call: "Tense finish keeps it close",
};

const PRIORITY_BY_TYPE: Record<ReplayMoment["type"], number> = {
  comeback: 1,
  clutch: 2,
  lead_change: 3,
  score_swing: 4,
  blunder: 5,
  close_call: 6,
};

const SPOILER_TYPES = new Set<ReplayMoment["type"]>(["comeback", "clutch"]);

function normalizeSignalValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function resolveSignalValue(signals: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (key in signals) {
      const normalized = normalizeSignalValue(signals[key]);
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
}

function getScoreDelta(signals: Record<string, unknown>): number {
  const keys = ["scoreDelta", "delta", "lead", "diff", "deficit", "margin"];
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.abs(value);
    }
  }
  return 0;
}

function buildTemplateValues(
  type: ReplayMoment["type"],
  signals: Record<string, unknown>,
): Record<string, string> {
  const agent = resolveSignalValue(signals, [
    "agent",
    "agentId",
    "winner",
    "newLeader",
    "previousLeader",
  ]);
  const delta = resolveSignalValue(signals, [
    "delta",
    "scoreDelta",
    "lead",
    "diff",
    "margin",
    "deficit",
  ]);
  const deficit = resolveSignalValue(signals, ["deficit", "scoreDelta", "delta", "lead", "diff"]);
  const margin = resolveSignalValue(signals, ["margin", "diff", "delta", "lead", "scoreDelta"]);

  switch (type) {
    case "score_swing":
      return {
        ...(agent ? { agent } : {}),
        ...(delta ? { delta } : {}),
      };
    case "lead_change":
      return {
        ...(agent ? { agent } : {}),
      };
    case "comeback":
      return {
        ...(agent ? { agent } : {}),
        ...(deficit ? { deficit } : {}),
      };
    case "blunder":
      return {
        ...(agent ? { agent } : {}),
      };
    case "clutch":
      return {
        ...(agent ? { agent } : {}),
      };
    case "close_call":
      return {
        ...(margin ? { margin } : {}),
      };
    default:
      return {};
  }
}

function renderHeadline(type: ReplayMoment["type"], signals: Record<string, unknown>): string {
  const template = HEADLINE_TEMPLATES[type];
  const fallback = FALLBACK_HEADLINES[type];
  const values = buildTemplateValues(type, signals);
  const keys = Array.from(template.matchAll(/\{(\w+)\}/g), (match) => match[1]);

  for (const key of keys) {
    if (!values[key]) {
      return fallback;
    }
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function formatHighlightId(index: number): string {
  return `hl-${String(index + 1).padStart(3, "0")}`;
}

export function generateHighlights(
  moments: ReplayMoment[],
  matchSummary: MatchSummary,
): HighlightsFile | null {
  if (moments.length === 0) {
    return null;
  }

  const sorted = [...moments].sort((a, b) => {
    const priorityDelta = PRIORITY_BY_TYPE[a.type] - PRIORITY_BY_TYPE[b.type];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const scoreDelta = getScoreDelta(b.signals) - getScoreDelta(a.signals);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    if (a.startSeq !== b.startSeq) {
      return b.startSeq - a.startSeq;
    }
    return a.id.localeCompare(b.id);
  });

  const highlights = sorted.map((moment, index): Highlight => {
    const headline = renderHeadline(moment.type, moment.signals);
    return {
      id: formatHighlightId(index),
      momentRef: moment.id,
      type: moment.type,
      startSeq: moment.startSeq,
      endSeq: moment.endSeq,
      headline,
      ...(moment.description ? { description: moment.description } : {}),
      priority: PRIORITY_BY_TYPE[moment.type],
      spoilerLevel: SPOILER_TYPES.has(moment.type) ? "reveals_outcome" : "safe",
    };
  });

  const headline = highlights[0]?.headline;
  const subheadline = highlights[1]?.headline;

  return {
    schemaVersion: "1.0.0",
    matchId: matchSummary.matchId,
    generatedBy: "harness",
    authoritative: false,
    highlights,
    ...(headline ? { headline } : {}),
    ...(subheadline ? { subheadline } : {}),
  };
}
