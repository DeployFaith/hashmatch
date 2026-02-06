import type { Event, Episode, Match, Severity, EventType } from "@/lib/models";
import type { ParsedMatchEvent } from "./parser";

// ---------------------------------------------------------------------------
// Provenance metadata extracted from MatchStarted
// ---------------------------------------------------------------------------

export interface ReplayMeta {
  matchId: string;
  scenarioName: string;
  agentIds: string[];
  seed: number;
  maxTurns: number;
  engineCommit?: string;
  engineVersion?: string;
  totalTurns: number;
  endReason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateJson(v: unknown, max = 120): string {
  let s: string;
  try {
    s = JSON.stringify(v);
  } catch {
    s = String(v);
  }
  if (s.length <= max) {
    return s;
  }
  return s.slice(0, max - 3) + "...";
}

/** Map engine PascalCase type to UI snake_case type. */
function mapEventType(type: string): EventType {
  const mapping: Record<string, EventType> = {
    MatchStarted: "match_started",
    MatchEnded: "match_ended",
    TurnStarted: "turn_started",
    ActionSubmitted: "action_submitted",
    ActionAdjudicated: "action_adjudicated",
    StateUpdated: "state_updated",
    AgentError: "agent_error",
    ObservationEmitted: "observation_emitted",
  };
  return mapping[type] || "state_updated";
}

/** Derive severity from engine event. */
function deriveSeverity(event: ParsedMatchEvent): Severity {
  if (event.type === "AgentError") {
    return "error";
  }
  if (event.type === "ActionAdjudicated" && !event.valid) {
    return "warning";
  }
  if (event.type === "MatchEnded") {
    return event.reason === "error" ? "error" : "success";
  }
  if (event.type === "ActionAdjudicated" && event.valid) {
    return "success";
  }
  return "info";
}

/** Generate a human-readable summary for an engine event. */
function summarize(event: ParsedMatchEvent): string {
  switch (event.type) {
    case "MatchStarted":
      return `Match started: ${event.scenarioName} with ${event.agentIds.length} agents (seed: ${event.seed})`;
    case "TurnStarted":
      return `Turn ${event.turn} started`;
    case "ObservationEmitted":
      return `[${event.agentId}] received observation: ${truncateJson(event.observation, 80)}`;
    case "ActionSubmitted":
      return `[${event.agentId}] submitted action: ${truncateJson(event.action, 80)}`;
    case "ActionAdjudicated": {
      const mark = event.valid ? "valid" : "INVALID";
      return `[${event.agentId}] action ${mark}: ${truncateJson(event.feedback, 80)}`;
    }
    case "StateUpdated":
      return `State updated: ${truncateJson(event.summary, 80)}`;
    case "AgentError":
      return `[${event.agentId}] ERROR: ${event.message}`;
    case "MatchEnded":
      return `Match ended (${event.reason}). Scores: ${truncateJson(event.scores)}`;
  }
}

/** Generate detail text for an event. */
function detailize(event: ParsedMatchEvent): string | undefined {
  switch (event.type) {
    case "MatchStarted":
      return `Agents: ${event.agentIds.join(", ")} | Max turns: ${event.maxTurns}`;
    case "ObservationEmitted":
      return `Full observation: ${truncateJson(event.observation, 200)}`;
    case "ActionSubmitted":
      return `Full action: ${truncateJson(event.action, 200)}`;
    case "ActionAdjudicated":
      return `Feedback: ${truncateJson(event.feedback, 200)}`;
    case "StateUpdated":
      return `Full state: ${truncateJson(event.summary, 200)}`;
    case "MatchEnded":
      return event.details !== undefined
        ? `Details: ${truncateJson(event.details, 200)}`
        : undefined;
    default:
      return undefined;
  }
}

/** Extract agentId if present on the event. */
function extractAgentId(event: ParsedMatchEvent): string | undefined {
  if ("agentId" in event && typeof event.agentId === "string") {
    return event.agentId;
  }
  return undefined;
}

/** Extract turn number if present on the event. */
export function extractTurn(event: ParsedMatchEvent): number | undefined {
  if ("turn" in event && typeof event.turn === "number") {
    return event.turn;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface ReplayViewModel {
  match: Match;
  events: Event[];
  meta: ReplayMeta;
}

/** Convert engine events to UI view model. */
export function adaptReplayToViewModel(engineEvents: ParsedMatchEvent[]): ReplayViewModel {
  if (engineEvents.length === 0) {
    throw new Error("No events to adapt");
  }

  const first = engineEvents[0];
  const matchId = first.matchId;
  const now = new Date().toISOString();

  // Extract MatchStarted and MatchEnded
  const started = engineEvents.find((e) => e.type === "MatchStarted");
  const ended = engineEvents.find((e) => e.type === "MatchEnded");

  // Build metadata
  const meta: ReplayMeta = {
    matchId,
    scenarioName: started?.type === "MatchStarted" ? started.scenarioName : "unknown",
    agentIds: started?.type === "MatchStarted" ? started.agentIds : [],
    seed: started?.type === "MatchStarted" ? started.seed : 0,
    maxTurns: started?.type === "MatchStarted" ? started.maxTurns : 0,
    engineCommit:
      started?.type === "MatchStarted"
        ? (started as Record<string, unknown>).engineCommit as string | undefined
        : undefined,
    engineVersion:
      started?.type === "MatchStarted"
        ? (started as Record<string, unknown>).engineVersion as string | undefined
        : undefined,
    totalTurns: ended?.type === "MatchEnded" ? ended.turns : 0,
    endReason: ended?.type === "MatchEnded" ? ended.reason : undefined,
  };

  // Convert each engine event to a UI Event
  const uiEvents: Event[] = engineEvents.map((e) => ({
    id: `replay-${matchId}-${e.seq}`,
    ts: now,
    type: mapEventType(e.type),
    severity: deriveSeverity(e),
    summary: summarize(e),
    details: detailize(e),
    relatedAgentId: extractAgentId(e),
  }));

  // Group events into episodes by turn
  const episodeMap = new Map<number, string[]>(); // turn -> eventIds
  const preGameIds: string[] = [];
  let currentTurn = 0;

  for (let i = 0; i < engineEvents.length; i++) {
    const eng = engineEvents[i];
    const uiId = uiEvents[i].id;

    if (eng.type === "TurnStarted") {
      currentTurn = eng.turn;
    }

    if (currentTurn === 0) {
      preGameIds.push(uiId);
    } else {
      const existing = episodeMap.get(currentTurn) || [];
      existing.push(uiId);
      episodeMap.set(currentTurn, existing);
    }
  }

  // Detect post-game events (MatchEnded after all turns)
  // MatchEnded is already in the last turn's episode, which is fine

  const episodes: Episode[] = [];

  if (preGameIds.length > 0) {
    episodes.push({
      id: `replay-${matchId}-ep-pre`,
      title: "Match Setup",
      startedAt: now,
      eventIds: preGameIds,
    });
  }

  const sortedTurns = Array.from(episodeMap.keys()).sort((a, b) => a - b);
  for (const turn of sortedTurns) {
    episodes.push({
      id: `replay-${matchId}-ep-${turn}`,
      title: `Turn ${turn}`,
      startedAt: now,
      eventIds: episodeMap.get(turn)!,
    });
  }

  // Build Match
  const scores =
    ended?.type === "MatchEnded" ? (ended.scores as Record<string, number>) : undefined;

  const match: Match = {
    id: matchId,
    title: `Replay: ${meta.scenarioName}`,
    status: ended ? (ended.type === "MatchEnded" && ended.reason === "error" ? "error" : "completed") : "in_progress",
    startedAt: now,
    endedAt: ended ? now : undefined,
    agents: meta.agentIds,
    rulesetId: meta.scenarioName,
    episodes,
    score: scores,
  };

  return { match, events: uiEvents, meta };
}
