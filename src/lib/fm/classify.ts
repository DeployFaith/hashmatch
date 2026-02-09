import type { ScenarioHints } from "../../contract/interfaces.js";
import type {
  ActionAdjudicatedEvent,
  ActionSubmittedEvent,
  AgentId,
  AgentRawOutputEvent,
  InvalidActionEvent,
  JsonValue,
  MatchEndedEvent,
  MatchEvent,
} from "../../contract/types.js";
import type { FailureModeHit, FailureModeProfile } from "./types.js";
import { FM_CLASSIFIER_VERSION } from "./version.js";

const WAIT_SPAM_THRESHOLD = 5;
const TOOL_STORM_MIN_TURNS = 10;
const TOOL_STORM_UNIQUE_RATIO_THRESHOLD = 0.25;
const TOOL_STORM_CYCLE_WINDOW = 6;

const LOG_BUDGET_REASONS = new Set(["logBudgetExceeded", "log-budget-exceeded"]);

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getActionType(action: JsonValue): string | null {
  if (!isRecord(action)) {
    return null;
  }
  const type = action.type;
  return typeof type === "string" ? type : null;
}

function getActionKey(action: JsonValue): string | null {
  if (!isRecord(action)) {
    return null;
  }
  const type = getActionType(action);
  if (!type) {
    return null;
  }
  const target = action.target;
  if (typeof target === "string" || typeof target === "number") {
    return `${type}:${target}`;
  }
  return `${type}:`;
}

function isHallucinatedReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("unknown action") ||
    normalized.includes("unknown action type") ||
    normalized.includes("invalid action type") ||
    normalized.includes("invalid target") ||
    normalized.includes("schema")
  );
}

function isJsonRecovery(adjudication: ActionAdjudicatedEvent): boolean {
  if (adjudication.method !== "direct-json") {
    return true;
  }
  if (adjudication.fallbackReason) {
    return true;
  }
  return adjudication.warnings.length > 0;
}

function hasShortCycle(keys: string[]): boolean {
  if (keys.length < TOOL_STORM_CYCLE_WINDOW) {
    return false;
  }
  const recent = keys.slice(-TOOL_STORM_CYCLE_WINDOW);
  const isLength2 =
    recent[0] === recent[2] &&
    recent[1] === recent[3] &&
    recent[2] === recent[4] &&
    recent[3] === recent[5];
  if (isLength2) {
    return true;
  }
  const isLength3 = recent[0] === recent[3] && recent[1] === recent[4] && recent[2] === recent[5];
  return isLength3;
}

function orderHits(hits: FailureModeHit[]): FailureModeHit[] {
  return [...hits].sort((a, b) => {
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    return a.id.localeCompare(b.id);
  });
}

function ensureRate(hit: FailureModeHit, totalTurns: number): FailureModeHit {
  if (hit.rate === undefined) {
    return { ...hit, rate: hit.count / Math.max(1, totalTurns) };
  }
  return hit;
}

export function classifyFailureModes(args: {
  events: MatchEvent[];
  scenarioHints: ScenarioHints;
  agentIds: string[];
  maxTurns?: number;
}): FailureModeProfile {
  const { events, scenarioHints, agentIds } = args;
  const byAgentId: Record<AgentId, FailureModeHit[]> = Object.fromEntries(
    agentIds.map((agentId) => [agentId, []]),
  );
  const noopActionSet = new Set(scenarioHints.noopActions);
  const actionEventsByAgent = new Map<
    AgentId,
    Array<ActionSubmittedEvent & { actionType: string | null; actionKey: string | null }>
  >();
  const invalidActionsByAgent = new Map<AgentId, InvalidActionEvent[]>();
  const adjudicationsByAgent = new Map<AgentId, ActionAdjudicatedEvent[]>();
  const rawOutputsByAgent = new Map<AgentId, AgentRawOutputEvent[]>();
  const logSpamEventsByAgent = new Map<AgentId, MatchEvent[]>();

  let matchEnded: MatchEndedEvent | null = null;

  for (const event of events) {
    if (event.type === "ActionSubmitted") {
      const actionType = getActionType(event.action);
      const actionKey = getActionKey(event.action);
      const existing = actionEventsByAgent.get(event.agentId) ?? [];
      existing.push({ ...event, actionType, actionKey });
      actionEventsByAgent.set(event.agentId, existing);
      continue;
    }
    if (event.type === "InvalidAction") {
      const existing = invalidActionsByAgent.get(event.agentId) ?? [];
      existing.push(event);
      invalidActionsByAgent.set(event.agentId, existing);
      continue;
    }
    if (event.type === "ActionAdjudicated") {
      const existing = adjudicationsByAgent.get(event.agentId) ?? [];
      existing.push(event);
      adjudicationsByAgent.set(event.agentId, existing);
      continue;
    }
    if (event.type === "AgentRawOutput") {
      const existing = rawOutputsByAgent.get(event.agentId) ?? [];
      existing.push(event);
      rawOutputsByAgent.set(event.agentId, existing);
      continue;
    }
    if (event.type === "MatchEnded") {
      matchEnded = event;
      continue;
    }
    if (
      "truncated" in event &&
      typeof event.truncated === "boolean" &&
      event.truncated &&
      "agentId" in event &&
      typeof event.agentId === "string"
    ) {
      const existing = logSpamEventsByAgent.get(event.agentId) ?? [];
      existing.push(event);
      logSpamEventsByAgent.set(event.agentId, existing);
    }
  }

  const logBudgetExceeded = matchEnded ? LOG_BUDGET_REASONS.has(matchEnded.reason) : false;

  for (const agentId of agentIds) {
    const actionEvents = (actionEventsByAgent.get(agentId) ?? []).sort((a, b) => {
      if (a.turn !== b.turn) {
        return a.turn - b.turn;
      }
      return a.seq - b.seq;
    });
    const totalTurnsForAgent = actionEvents.length;
    const hits: FailureModeHit[] = [];

    if (actionEvents.length > 0) {
      let noopCount = 0;
      let maxNoopStreak = 0;
      let currentNoopStreak = 0;
      for (const actionEvent of actionEvents) {
        if (actionEvent.actionType && noopActionSet.has(actionEvent.actionType)) {
          noopCount += 1;
          currentNoopStreak += 1;
          if (currentNoopStreak > maxNoopStreak) {
            maxNoopStreak = currentNoopStreak;
          }
        } else {
          currentNoopStreak = 0;
        }
      }
      if (noopCount >= WAIT_SPAM_THRESHOLD || maxNoopStreak >= WAIT_SPAM_THRESHOLD) {
        hits.push({
          id: "FM-10",
          count: noopCount,
          detectorSource: "core",
        });
      }

      const actionKeys = actionEvents
        .map((event) => event.actionKey)
        .filter((key): key is string => typeof key === "string");
      const uniqueActionCount = new Set(actionKeys).size;
      const uniqueRatio = uniqueActionCount / Math.max(1, totalTurnsForAgent);
      const hasCycle = hasShortCycle(actionKeys);
      if (
        totalTurnsForAgent >= TOOL_STORM_MIN_TURNS &&
        (uniqueRatio <= TOOL_STORM_UNIQUE_RATIO_THRESHOLD || hasCycle)
      ) {
        hits.push({
          id: "FM-16",
          count: totalTurnsForAgent - uniqueActionCount,
          detectorSource: "core",
        });
      }
    }

    const invalidActions = invalidActionsByAgent.get(agentId) ?? [];
    const hallucinatedCount = invalidActions.filter((event) =>
      isHallucinatedReason(event.reason),
    ).length;
    if (hallucinatedCount > 0) {
      hits.push({
        id: "FM-06",
        count: hallucinatedCount,
        detectorSource: "core",
      });
    }

    const adjudications = adjudicationsByAgent.get(agentId) ?? [];
    const jsonRecoveryCount = adjudications.filter(isJsonRecovery).length;
    if (jsonRecoveryCount > 0) {
      hits.push({
        id: "FM-13",
        count: jsonRecoveryCount,
        detectorSource: "core",
      });
    }

    const rawOutputs = rawOutputsByAgent.get(agentId) ?? [];
    const verboseCount = rawOutputs.filter((event) => event.truncated).length;
    if (verboseCount > 0) {
      hits.push({
        id: "FM-12",
        count: verboseCount,
        detectorSource: "core",
      });
    }

    const logSpamEvents = logSpamEventsByAgent.get(agentId) ?? [];
    const logSpamCount = logSpamEvents.length + (logBudgetExceeded ? 1 : 0);
    if (logSpamCount > 0) {
      hits.push({
        id: "FM-15",
        count: logSpamCount,
        detectorSource: "core",
      });
    }

    byAgentId[agentId] = orderHits(
      hits.map((hit) => ensureRate(hit, totalTurnsForAgent)),
    );
  }

  return {
    byAgentId,
    fmClassifierVersion: FM_CLASSIFIER_VERSION,
  };
}
