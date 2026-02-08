import type { MatchEvent } from "../../contract/types.js";
import type { ReplayEvent } from "./parseJsonl.js";

export interface ReplayMoment {
  id: string;
  label: string;
  type: "score_swing" | "lead_change" | "comeback" | "blunder" | "clutch" | "close_call";
  startSeq: number;
  endSeq: number;
  signals: Record<string, unknown>;
  description?: string;
}

export interface MomentEventRange {
  startEventIdx: number;
  endEventIdx: number;
}

export type MomentEventRangeMap = Map<string, MomentEventRange>;

export interface MomentDetectionConfig {
  scoreSwingWindow: number;
  scoreSwingThreshold?: number;
  scoreSwingThresholdFallback: number;
  leadChangeMinDelta: number;
  comebackDeficit?: number;
  comebackDeficitFallback: number;
  clutchFinalTurnPercent: number;
  closeCallThreshold?: number;
  closeCallThresholdFallback: number;
}

type MomentEvent = MatchEvent | ReplayEvent;

type ScoreRecord = Record<string, number>;

interface ScoreSnapshot {
  seq: number;
  turn?: number;
  scores: ScoreRecord;
}

interface ScoredMoment extends ReplayMoment {
  impact: number;
}

const DEFAULT_CONFIG: MomentDetectionConfig = {
  scoreSwingWindow: 3,
  scoreSwingThresholdFallback: 10,
  leadChangeMinDelta: 1,
  comebackDeficitFallback: 10,
  clutchFinalTurnPercent: 0.1,
  closeCallThresholdFallback: 5,
};

const SCORE_KEYS = ["scores", "score", "scoreboard", "points", "totals"] as const;
const MAX_SCORE_KEYS = ["maxScore", "maxPoints", "scoreMax", "maxTotalScore"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractNumericRecord(value: unknown): ScoreRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(value).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v),
  );
  if (entries.length < 2) {
    return null;
  }
  return entries.reduce<ScoreRecord>((acc, [key, value]) => {
    acc[key] = value as number;
    return acc;
  }, {});
}

function extractScoreRecordFromObject(obj: Record<string, unknown>): ScoreRecord | null {
  for (const key of SCORE_KEYS) {
    if (key in obj) {
      const candidate = extractNumericRecord(obj[key]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
}

function extractScoreRecord(payload: Record<string, unknown>): ScoreRecord | null {
  const fromKeys = extractScoreRecordFromObject(payload);
  if (fromKeys) {
    return fromKeys;
  }

  if ("summary" in payload && isRecord(payload.summary)) {
    const fromSummary = extractScoreRecordFromObject(payload.summary);
    if (fromSummary) {
      return fromSummary;
    }
  }

  if ("state" in payload && isRecord(payload.state)) {
    const fromState = extractScoreRecordFromObject(payload.state);
    if (fromState) {
      return fromState;
    }
  }

  return null;
}

function extractMaxScore(events: MomentEvent[]): number | null {
  for (const event of events) {
    const payload = getPayload(event);
    for (const key of MAX_SCORE_KEYS) {
      const value = payload[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
      }
    }
  }
  return null;
}

function extractTotalTurns(events: MomentEvent[], snapshots: ScoreSnapshot[]): number | null {
  for (const event of events) {
    const payload = getPayload(event);
    if (typeof payload.turns === "number" && Number.isFinite(payload.turns)) {
      return payload.turns;
    }
    if (typeof payload.maxTurns === "number" && Number.isFinite(payload.maxTurns)) {
      return payload.maxTurns;
    }
  }

  const lastTurn = [...snapshots]
    .reverse()
    .find((snapshot) => typeof snapshot.turn === "number")?.turn;
  if (typeof lastTurn === "number") {
    return lastTurn;
  }

  const lastEventTurn = [...events]
    .reverse()
    .find((event) => typeof (event as { turn?: number }).turn === "number") as
    | { turn?: number }
    | undefined;
  if (lastEventTurn && typeof lastEventTurn.turn === "number") {
    return lastEventTurn.turn;
  }

  return null;
}

function getPayload(event: MomentEvent): Record<string, unknown> {
  if ("raw" in event && isRecord(event.raw)) {
    return event.raw;
  }
  return event as unknown as Record<string, unknown>;
}

function buildScoreSeries(events: MomentEvent[]): ScoreSnapshot[] {
  const snapshots: ScoreSnapshot[] = [];

  for (const event of events) {
    const payload = getPayload(event);
    const scoreRecord = extractScoreRecord(payload);
    if (!scoreRecord) {
      continue;
    }
    const turn =
      typeof (event as { turn?: number }).turn === "number"
        ? (event as { turn?: number }).turn
        : undefined;
    snapshots.push({ seq: event.seq, turn, scores: scoreRecord });
  }

  return snapshots.sort((a, b) => a.seq - b.seq);
}

function getLeader(
  scores: ScoreRecord,
): { leader: string; lead: number; runnerUp: string; diff: number } | null {
  const entries = Object.entries(scores);
  if (entries.length < 2) {
    return null;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const [leaderId, leaderScore] = entries[0];
  const [runnerUpId, runnerUpScore] = entries[1];
  if (leaderScore === runnerUpScore) {
    return null;
  }
  return {
    leader: leaderId,
    lead: leaderScore,
    runnerUp: runnerUpId,
    diff: leaderScore - runnerUpScore,
  };
}

function buildScoreSwingMoments(
  snapshots: ScoreSnapshot[],
  threshold: number,
  windowSize: number,
): ScoredMoment[] {
  const moments: ScoredMoment[] = [];

  for (let i = 0; i < snapshots.length; i++) {
    const start = snapshots[i];
    for (let j = i + 1; j < Math.min(snapshots.length, i + windowSize); j++) {
      const end = snapshots[j];
      let bestAgent = "";
      let bestDelta = 0;
      for (const [agentId, startScore] of Object.entries(start.scores)) {
        if (!(agentId in end.scores)) {
          continue;
        }
        const delta = Math.abs(end.scores[agentId] - startScore);
        if (delta > bestDelta) {
          bestDelta = delta;
          bestAgent = agentId;
        }
      }

      if (bestDelta >= threshold) {
        moments.push({
          id: `moment-score-swing-${start.seq}-${end.seq}-${bestAgent || "unknown"}`,
          label: "Score swing",
          type: "score_swing",
          startSeq: start.seq,
          endSeq: end.seq,
          signals: {
            agentId: bestAgent || null,
            delta: bestDelta,
            startScores: start.scores,
            endScores: end.scores,
          },
          description: bestAgent
            ? `${bestAgent} swung the score by ${bestDelta}.`
            : `Score swung by ${bestDelta}.`,
          impact: bestDelta,
        });
      }
    }
  }

  return moments;
}

function buildLeadChangeMoments(snapshots: ScoreSnapshot[], minDelta: number): ScoredMoment[] {
  const moments: ScoredMoment[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const next = snapshots[i];
    const prevLeader = getLeader(prev.scores);
    const nextLeader = getLeader(next.scores);

    if (!prevLeader || !nextLeader) {
      continue;
    }

    if (prevLeader.leader !== nextLeader.leader && nextLeader.diff >= minDelta) {
      moments.push({
        id: `moment-lead-change-${prev.seq}-${next.seq}-${nextLeader.leader}`,
        label: `Lead change: ${nextLeader.leader}`,
        type: "lead_change",
        startSeq: prev.seq,
        endSeq: next.seq,
        signals: {
          previousLeader: prevLeader.leader,
          newLeader: nextLeader.leader,
          lead: nextLeader.diff,
        },
        description: `${nextLeader.leader} overtook ${prevLeader.leader}.`,
        impact: nextLeader.diff,
      });
    }
  }

  return moments;
}

function buildComebackMoments(
  snapshots: ScoreSnapshot[],
  deficitThreshold: number,
): ScoredMoment[] {
  if (snapshots.length === 0) {
    return [];
  }
  const finalSnapshot = snapshots[snapshots.length - 1];
  const finalLeader = getLeader(finalSnapshot.scores);
  if (!finalLeader) {
    return [];
  }

  let maxDeficit = 0;
  let deficitSnapshot: ScoreSnapshot | null = null;

  for (const snapshot of snapshots) {
    const leader = getLeader(snapshot.scores);
    if (!leader) {
      continue;
    }
    const finalScore = snapshot.scores[finalLeader.leader];
    if (typeof finalScore !== "number") {
      continue;
    }
    const deficit = leader.lead - finalScore;
    if (deficit > maxDeficit) {
      maxDeficit = deficit;
      deficitSnapshot = snapshot;
    }
  }

  if (maxDeficit <= deficitThreshold || !deficitSnapshot) {
    return [];
  }

  return [
    {
      id: `moment-comeback-${deficitSnapshot.seq}-${finalSnapshot.seq}-${finalLeader.leader}`,
      label: `Comeback: ${finalLeader.leader}`,
      type: "comeback",
      startSeq: deficitSnapshot.seq,
      endSeq: finalSnapshot.seq,
      signals: {
        winner: finalLeader.leader,
        deficit: maxDeficit,
      },
      description: `${finalLeader.leader} erased a ${maxDeficit} deficit to win.`,
      impact: maxDeficit,
    },
  ];
}

function buildBlunderMoments(events: MomentEvent[]): ScoredMoment[] {
  const moments: ScoredMoment[] = [];

  for (const event of events) {
    const payload = getPayload(event);
    const type = event.type ?? payload.type;
    const isExplicitError =
      type === "AgentError" ||
      type === "ActionRejected" ||
      type === "ActionInvalid" ||
      type === "ActionFailed" ||
      (typeof type === "string" && /Error|Rejected|Invalid/.test(type));
    const validFlag =
      ("valid" in payload && payload.valid === false) ||
      ("accepted" in payload && payload.accepted === false);

    if (!isExplicitError && !validFlag) {
      continue;
    }

    const agentId =
      typeof (event as { agentId?: string }).agentId === "string"
        ? (event as { agentId?: string }).agentId
        : typeof payload.agentId === "string"
          ? payload.agentId
          : null;

    moments.push({
      id: `moment-blunder-${event.seq}-${agentId ?? "unknown"}`,
      label: agentId ? `Blunder: ${agentId}` : "Blunder",
      type: "blunder",
      startSeq: event.seq,
      endSeq: event.seq,
      signals: {
        agentId,
        eventType: type,
      },
      description: "Explicit error/invalid action detected.",
      impact: 1,
    });
  }

  // Note: if no explicit error indicators exist in the schema (e.g., AgentError,
  // ActionAdjudicated.valid=false, ActionRejected/ActionInvalid), this detector
  // intentionally returns an empty array.
  return moments;
}

function buildClutchMoments(
  events: MomentEvent[],
  snapshots: ScoreSnapshot[],
  totalTurns: number | null,
  clutchPercent: number,
): ScoredMoment[] {
  if (!totalTurns || snapshots.length === 0) {
    return [];
  }

  const finalSnapshot = snapshots[snapshots.length - 1];
  const finalLeader = getLeader(finalSnapshot.scores);
  if (!finalLeader) {
    return [];
  }

  let decisiveIndex = 0;
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const leader = getLeader(snapshots[i].scores);
    if (!leader || leader.leader !== finalLeader.leader) {
      decisiveIndex = Math.min(i + 1, snapshots.length - 1);
      break;
    }
  }

  const decisiveSnapshot = snapshots[decisiveIndex];
  const decisiveTurn = decisiveSnapshot.turn;
  if (typeof decisiveTurn !== "number") {
    return [];
  }

  const thresholdTurn = Math.max(1, Math.ceil(totalTurns * (1 - clutchPercent)));
  if (decisiveTurn < thresholdTurn) {
    return [];
  }

  return [
    {
      id: `moment-clutch-${decisiveSnapshot.seq}-${finalSnapshot.seq}-${finalLeader.leader}`,
      label: "Clutch finish",
      type: "clutch",
      startSeq: decisiveSnapshot.seq,
      endSeq: finalSnapshot.seq,
      signals: {
        winner: finalLeader.leader,
        decisiveTurn,
        totalTurns,
      },
      description: `${finalLeader.leader} secured the win late in the match.`,
      impact: finalLeader.diff,
    },
  ];
}

function buildCloseCallMoments(
  snapshots: ScoreSnapshot[],
  totalTurns: number | null,
  threshold: number,
): ScoredMoment[] {
  if (snapshots.length === 0) {
    return [];
  }
  const finalSnapshot = snapshots[snapshots.length - 1];
  const finalLeader = getLeader(finalSnapshot.scores);
  if (!finalLeader) {
    return [];
  }

  if (finalLeader.diff > threshold) {
    return [];
  }

  let startSnapshot = finalSnapshot;
  if (totalTurns) {
    const thresholdTurn = Math.max(1, Math.ceil(totalTurns * 0.9));
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const snapshot = snapshots[i];
      const leader = getLeader(snapshot.scores);
      if (!leader || leader.diff > threshold) {
        break;
      }
      if (typeof snapshot.turn === "number" && snapshot.turn < thresholdTurn) {
        break;
      }
      startSnapshot = snapshot;
    }
  }

  return [
    {
      id: `moment-close-call-${startSnapshot.seq}-${finalSnapshot.seq}`,
      label: "Close call",
      type: "close_call",
      startSeq: startSnapshot.seq,
      endSeq: finalSnapshot.seq,
      signals: {
        winner: finalLeader.leader,
        diff: finalLeader.diff,
      },
      description: "Final score difference stayed razor-thin.",
      impact: threshold - finalLeader.diff,
    },
  ];
}

function dedupeMoments(moments: ScoredMoment[]): ReplayMoment[] {
  const sorted = [...moments].sort((a, b) => {
    if (b.impact !== a.impact) {
      return b.impact - a.impact;
    }
    if (a.startSeq !== b.startSeq) {
      return a.startSeq - b.startSeq;
    }
    if (a.endSeq !== b.endSeq) {
      return a.endSeq - b.endSeq;
    }
    return a.id.localeCompare(b.id);
  });

  const kept: ScoredMoment[] = [];
  const overlaps = (a: ScoredMoment, b: ScoredMoment) =>
    a.startSeq <= b.endSeq && a.endSeq >= b.startSeq;

  for (const moment of sorted) {
    if (kept.some((existing) => overlaps(existing, moment))) {
      continue;
    }
    kept.push(moment);
  }

  return kept
    .sort((a, b) => {
      if (a.startSeq !== b.startSeq) {
        return a.startSeq - b.startSeq;
      }
      if (b.impact !== a.impact) {
        return b.impact - a.impact;
      }
      return a.id.localeCompare(b.id);
    })
    .map(({ impact: _, ...rest }) => rest);
}

export function detectMoments(
  events: MomentEvent[],
  config: Partial<MomentDetectionConfig> = {},
): ReplayMoment[] {
  if (events.length === 0) {
    return [];
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const snapshots = buildScoreSeries(events);
  const maxScore = extractMaxScore(events);
  const totalTurns = extractTotalTurns(events, snapshots);

  const scoreSwingThreshold =
    mergedConfig.scoreSwingThreshold ??
    (maxScore ? maxScore * 0.15 : mergedConfig.scoreSwingThresholdFallback);
  const comebackThreshold =
    mergedConfig.comebackDeficit ??
    (maxScore ? maxScore * 0.2 : mergedConfig.comebackDeficitFallback);
  const closeCallThreshold =
    mergedConfig.closeCallThreshold ??
    (maxScore ? maxScore * 0.1 : mergedConfig.closeCallThresholdFallback);

  const moments: ScoredMoment[] = [];

  if (snapshots.length > 1) {
    moments.push(
      ...buildScoreSwingMoments(snapshots, scoreSwingThreshold, mergedConfig.scoreSwingWindow),
    );
    moments.push(...buildLeadChangeMoments(snapshots, mergedConfig.leadChangeMinDelta));
    moments.push(...buildComebackMoments(snapshots, comebackThreshold));
    moments.push(
      ...buildClutchMoments(events, snapshots, totalTurns, mergedConfig.clutchFinalTurnPercent),
    );
    moments.push(...buildCloseCallMoments(snapshots, totalTurns, closeCallThreshold));
  }

  moments.push(...buildBlunderMoments(events));

  return dedupeMoments(moments);
}

export function getMomentEventRange(
  moment: ReplayMoment,
  events: Array<{ seq: number }>,
): MomentEventRange {
  if (events.length === 0) {
    return { startEventIdx: 0, endEventIdx: 0 };
  }

  let startIdx = events.findIndex((event) => event.seq >= moment.startSeq);
  if (startIdx === -1) {
    startIdx = 0;
  }

  let endIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].seq <= moment.endSeq) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    endIdx = events.length - 1;
  }

  if (endIdx < startIdx) {
    endIdx = startIdx;
  }

  return { startEventIdx: startIdx, endEventIdx: endIdx };
}

export function buildMomentEventRangeMap(
  moments: ReplayMoment[],
  events: Array<{ seq: number }>,
): MomentEventRangeMap {
  const map: MomentEventRangeMap = new Map();
  for (const moment of moments) {
    map.set(moment.id, getMomentEventRange(moment, events));
  }
  return map;
}
