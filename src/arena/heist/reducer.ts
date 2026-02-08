import type { MatchEvent } from "../../contract/types.js";
import { initSceneFromScenario } from "./initSceneFromScenario.js";
import type {
  ActionLike,
  AgentVisual,
  AdjudicationLike,
  HeistSceneState,
  RoomId,
} from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry) => typeof entry === "string") as string[];
};

const createInitialState = (event: MatchEvent): HeistSceneState => ({
  matchId: event.matchId,
  scenarioName:
    event.type === "MatchStarted" && typeof event.scenarioName === "string"
      ? event.scenarioName
      : "",
  status: "idle",
  turn: { current: 0 },
  map: { rooms: {}, doors: {} },
  agents: {},
  guards: {},
  entities: {},
  items: {},
});

const toActionLike = (value: unknown): ActionLike | undefined => {
  if (isRecord(value)) {
    if (typeof value.type === "string") {
      return value as ActionLike;
    }
    return { type: "unknown", ...value } as ActionLike;
  }
  return undefined;
};

const toAdjudicationLike = (value: Record<string, unknown>): AdjudicationLike => {
  if (typeof value.type === "string") {
    return value as AdjudicationLike;
  }
  return { type: "ActionAdjudicated", ...value } as AdjudicationLike;
};

const extractScenarioParams = (event: MatchEvent): Record<string, unknown> | undefined => {
  if (event.type === "ObservationEmitted") {
    if (!isRecord(event.observation)) {
      return undefined;
    }
    const priv = event.observation._private;
    if (isRecord(priv)) {
      return {
        extractionRoomId: priv.extractionRoomId,
        map: priv.map,
        entities: priv.entities,
        items: priv.items,
      };
    }
  }

  if (event.type === "MatchEnded" && isRecord(event.details)) {
    const attempts = event.details.attempts;
    if (Array.isArray(attempts) && attempts.length > 0) {
      const firstAttempt = attempts[0];
      if (isRecord(firstAttempt)) {
        const details = firstAttempt.details;
        if (isRecord(details) && isRecord(details.params)) {
          return details.params as Record<string, unknown>;
        }
      }
    }
  }

  return undefined;
};

const hydrateFromScenario = (
  state: HeistSceneState,
  params: Record<string, unknown> | undefined,
): HeistSceneState => {
  if (!params) {
    return state;
  }

  const initialized = initSceneFromScenario(params);
  const hasRooms = Object.keys(state.map.rooms).length > 0;
  const hasDoors = Object.keys(state.map.doors).length > 0;
  const hasEntities = Object.keys(state.entities).length > 0;
  const hasItems = Object.keys(state.items).length > 0;
  const hasGuards = Object.keys(state.guards).length > 0;

  if (hasRooms && hasDoors && hasEntities && hasItems && hasGuards) {
    return state;
  }

  return {
    ...state,
    map: {
      rooms: hasRooms ? state.map.rooms : initialized.map.rooms,
      doors: hasDoors ? state.map.doors : initialized.map.doors,
    },
    guards: hasGuards ? state.guards : initialized.guards,
    entities: hasEntities ? state.entities : initialized.entities,
    items: hasItems ? state.items : initialized.items,
  };
};

const updateAgent = (
  state: HeistSceneState,
  agentId: string,
  updater: (agent: AgentVisual) => AgentVisual,
): HeistSceneState => {
  const existing = state.agents[agentId] ?? { agentId };
  return {
    ...state,
    agents: {
      ...state.agents,
      [agentId]: updater(existing),
    },
  };
};

const updateDoorLocks = (
  state: HeistSceneState,
  doorUpdates: Array<{ doorId: string; locked: boolean }>,
): HeistSceneState => {
  if (doorUpdates.length === 0) {
    return state;
  }
  const doors = { ...state.map.doors };
  for (const update of doorUpdates) {
    const existing = doors[update.doorId];
    if (existing) {
      doors[update.doorId] = { ...existing, isLocked: update.locked };
    }
  }
  return { ...state, map: { ...state.map, doors } };
};

const updateItemRooms = (
  state: HeistSceneState,
  itemRooms: Array<{ itemId: string; roomId?: string }>,
): HeistSceneState => {
  if (itemRooms.length === 0) {
    return state;
  }
  const items = { ...state.items };
  for (const update of itemRooms) {
    const existing = items[update.itemId];
    if (existing) {
      items[update.itemId] = { ...existing, roomId: update.roomId ?? existing.roomId };
    }
  }
  return { ...state, items };
};

const updateEntityState = (
  state: HeistSceneState,
  updates: Record<string, Record<string, unknown>>,
): HeistSceneState => {
  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return state;
  }
  const entities = { ...state.entities };
  for (const key of keys) {
    const existing = entities[key];
    if (existing) {
      entities[key] = {
        ...existing,
        state: { ...existing.state, ...updates[key] },
      };
    }
  }
  return { ...state, entities };
};

// Observed event types in fixture:
// MatchStarted -> init + hydrate
// TurnStarted -> turn progression
// ObservationEmitted -> per-agent state + visibility + hydration
// ActionSubmitted -> lastAction
// ActionAdjudicated -> lastAdjudication
// StateUpdated -> sceneFacts + agent room snapshots
// MatchEnded -> termination
export const reduceHeistEvent = (
  state: HeistSceneState | undefined,
  event: MatchEvent,
): HeistSceneState => {
  let nextState = state ?? createInitialState(event);

  nextState = hydrateFromScenario(nextState, extractScenarioParams(event));

  switch (event.type) {
    case "MatchStarted": {
      const agents: Record<string, AgentVisual> = { ...nextState.agents };
      for (const agentId of event.agentIds) {
        if (!agents[agentId]) {
          agents[agentId] = { agentId };
        }
      }
      nextState = {
        ...nextState,
        matchId: event.matchId,
        scenarioName: event.scenarioName,
        status: "running",
        turn: { current: 0, maxTurns: event.maxTurns },
        agents,
      };
      break;
    }
    case "TurnStarted": {
      nextState = {
        ...nextState,
        turn: {
          ...nextState.turn,
          current: event.turn,
        },
      };
      break;
    }
    case "ObservationEmitted": {
      if (event.agentId) {
        const observation = isRecord(event.observation) ? event.observation : {};
        const currentRoomId = asString(observation.currentRoomId);
        const adjacentRooms = Array.isArray(observation.adjacentRooms)
          ? observation.adjacentRooms
          : [];
        const visibleRooms: RoomId[] = [];
        if (currentRoomId) {
          visibleRooms.push(currentRoomId);
        }
        for (const entry of adjacentRooms) {
          if (isRecord(entry) && typeof entry.roomId === "string") {
            visibleRooms.push(entry.roomId);
          }
        }
        const observationVisibleRooms = asStringArray(observation.visibleRooms);
        nextState = updateAgent(nextState, event.agentId, (agent) => ({
          ...agent,
          roomId: currentRoomId ?? agent.roomId,
          visibleRooms: observationVisibleRooms ?? visibleRooms,
        }));

        const doorUpdates = adjacentRooms
          .map((entry) => {
            if (!isRecord(entry)) {
              return undefined;
            }
            const doorId = asString(entry.doorId);
            const locked = asBoolean(entry.locked);
            if (!doorId || locked === undefined) {
              return undefined;
            }
            return { doorId, locked };
          })
          .filter((entry): entry is { doorId: string; locked: boolean } => Boolean(entry));
        nextState = updateDoorLocks(nextState, doorUpdates);

        const visibleItems = Array.isArray(observation.visibleItems)
          ? observation.visibleItems
          : [];
        const itemRooms = visibleItems.flatMap((item) => {
          if (!isRecord(item)) {
            return [];
          }
          const itemId = asString(item.id);
          const roomId = asString(item.roomId);
          if (!itemId) {
            return [];
          }
          return [{ itemId, roomId }];
        });
        nextState = updateItemRooms(nextState, itemRooms);

        const priv = isRecord(observation._private) ? observation._private : undefined;
        if (priv) {
          const alertLevel = asNumber(priv.alertLevel);
          if (alertLevel !== undefined) {
            nextState = {
              ...nextState,
              sceneFacts: { ...nextState.sceneFacts, alertLevel },
            };
          }
          const terminalProgress = isRecord(priv.terminalProgress) ? priv.terminalProgress : null;
          const terminalHacked = isRecord(priv.terminalHacked) ? priv.terminalHacked : null;
          const updates: Record<string, Record<string, unknown>> = {};
          if (terminalProgress) {
            for (const [id, value] of Object.entries(terminalProgress)) {
              if (typeof value === "number") {
                updates[id] = { ...updates[id], progress: value };
              }
            }
          }
          if (terminalHacked) {
            for (const [id, value] of Object.entries(terminalHacked)) {
              if (typeof value === "boolean") {
                updates[id] = { ...updates[id], hacked: value };
              }
            }
          }
          nextState = updateEntityState(nextState, updates);
        }
      }
      break;
    }
    case "ActionSubmitted": {
      const action = toActionLike(event.action);
      if (event.agentId && action) {
        nextState = updateAgent(nextState, event.agentId, (agent) => ({
          ...agent,
          lastAction: action,
        }));
      }
      break;
    }
    case "ActionAdjudicated": {
      if (event.agentId) {
        const adjudication = toAdjudicationLike({
          type: "ActionAdjudicated",
          valid: event.valid,
          feedback: event.feedback,
          chosenAction: event.chosenAction,
          warnings: event.warnings,
          errors: event.errors,
          fallbackReason: event.fallbackReason,
        });
        nextState = updateAgent(nextState, event.agentId, (agent) => ({
          ...agent,
          lastAdjudication: adjudication,
        }));
      }
      break;
    }
    case "StateUpdated": {
      const summary = isRecord(event.summary) ? event.summary : undefined;
      const alertLevel = summary ? asNumber(summary.alertLevel) : undefined;
      if (alertLevel !== undefined) {
        nextState = {
          ...nextState,
          sceneFacts: { ...nextState.sceneFacts, alertLevel },
        };
      }
      const agents = summary && isRecord(summary.agents) ? summary.agents : undefined;
      if (agents) {
        for (const [agentId, agentSummary] of Object.entries(agents)) {
          if (!isRecord(agentSummary)) {
            continue;
          }
          const roomId = asString(agentSummary.roomId);
          if (!roomId) {
            continue;
          }
          nextState = updateAgent(nextState, agentId, (agent) => ({
            ...agent,
            roomId,
          }));
        }
      }
      break;
    }
    case "AgentError": {
      nextState = updateAgent(nextState, event.agentId, (agent) => ({
        ...agent,
        error: event.message,
      }));
      break;
    }
    case "MatchEnded": {
      let terminationReason: HeistSceneState["terminationReason"];
      if (event.reason === "completed") {
        terminationReason = "completed";
      } else if (event.reason === "maxTurnsReached") {
        terminationReason = "maxTurns";
      } else if (event.reason === "agentForfeited") {
        terminationReason = "error";
      } else {
        terminationReason = event.reason;
      }
      nextState = {
        ...nextState,
        status: "ended",
        terminationReason,
      };
      break;
    }
    default: {
      const existing = nextState.unknownEvents ?? [];
      nextState = {
        ...nextState,
        unknownEvents: [...existing, { type: event.type, seq: event.seq }],
      };
      break;
    }
  }

  return {
    ...nextState,
    lastEventSeq: event.seq,
  };
};
