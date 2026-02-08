import type { ActionAdjudicatedEvent, MatchEvent } from "@/contract/types";
import { reduceHeistEvent } from "@/arena/heist/reducer";
import type { HeistSceneState } from "@/arena/heist/types";
import { HEIST_ERROR_CODES, HEIST_RESULT_CODES } from "@/scenarios/heist/feedbackCodes";
import type {
  HeistMomentCandidate,
  HeistMomentId,
  MomentRegister,
} from "@/components/heist/moments/momentTypes";

// ---- Inventory ----

export interface AgentInventoryDisplay {
  agentId: string;
  agentLabel: string;
  items: {
    id: string;
    type: string;
    label: string;
    icon: string;
  }[];
  hasExtracted: boolean;
  score: number;
}

// ---- Objective Chain ----

export type ObjectiveStep = "keycard" | "terminal" | "vault" | "loot" | "extract";

export interface ObjectiveChainDisplay {
  steps: ObjectiveStep[];
  agentProgress: Record<string, Set<ObjectiveStep>>;
}

// ---- Alert ----

export interface AlertDisplay {
  level: number;
  maxLevel: number;
  label: string;
  color: string;
}

// ---- Terminals ----

export interface TerminalDisplay {
  id: string;
  label: string;
  hackProgress: number;
  hackRequired: number;
  isHacked: boolean;
  hackedByAgent?: string;
}

// ---- Doors ----

export interface DoorDisplay {
  id: string;
  label: string;
  roomA: string;
  roomB: string;
  isLocked: boolean;
}

// ---- Icon mapping ----

const ITEM_ICONS: Record<string, string> = {
  keycard: "\u{1F511}",
  tool: "\u{1F527}",
  loot: "\u{1F4B0}",
  intel: "\u{1F4C4}",
  objective: "\u2B50",
};

function itemIcon(kind: string): string {
  return ITEM_ICONS[kind] ?? "\u{1F4E6}";
}

// ---- Selector Functions ----

export function selectAgentInventory(
  state: HeistSceneState,
  scores: Record<string, number>,
): AgentInventoryDisplay[] {
  const agentIds = Object.keys(state.agents);
  const extractionRoomId = state.scenarioParams?.extractionRoomId;
  const requiredObjectives = state.scenarioParams?.requiredObjectives ?? [];

  return agentIds.map((agentId) => {
    const agent = state.agents[agentId];
    const heldItems = Object.values(state.items).filter((item) => item.heldBy === agentId);

    const hasAllObjectives =
      requiredObjectives.length > 0 &&
      requiredObjectives.every((objId) => heldItems.some((item) => item.itemId === objId));

    const hasExtracted =
      hasAllObjectives && !!extractionRoomId && agent.roomId === extractionRoomId;

    return {
      agentId,
      agentLabel: agentId,
      items: heldItems.map((item) => ({
        id: item.itemId,
        type: item.kind,
        label: item.label ?? item.itemId,
        icon: itemIcon(item.kind),
      })),
      hasExtracted,
      score: scores[agentId] ?? 0,
    };
  });
}

export function selectObjectiveChain(state: HeistSceneState): ObjectiveChainDisplay {
  const steps: ObjectiveStep[] = ["keycard", "terminal", "vault", "loot", "extract"];
  const agentIds = Object.keys(state.agents);
  const extractionRoomId = state.scenarioParams?.extractionRoomId;
  const requiredObjectives = state.scenarioParams?.requiredObjectives ?? [];

  const vaultOpened = Object.values(state.entities).some(
    (e) => e.kind === "vault" && e.state?.opened === true,
  );

  const agentProgress: Record<string, Set<ObjectiveStep>> = {};

  for (const agentId of agentIds) {
    const agent = state.agents[agentId];
    const heldItems = Object.values(state.items).filter((item) => item.heldBy === agentId);
    const progress = new Set<ObjectiveStep>();

    if (heldItems.some((item) => item.kind === "keycard")) {
      progress.add("keycard");
    }

    if (heldItems.some((item) => item.kind === "intel")) {
      progress.add("terminal");
    }

    if (vaultOpened) {
      progress.add("vault");
    }

    const hasAllObjectives =
      requiredObjectives.length > 0 &&
      requiredObjectives.every((objId) => heldItems.some((item) => item.itemId === objId));

    if (hasAllObjectives) {
      progress.add("loot");
    }

    if (hasAllObjectives && !!extractionRoomId && agent.roomId === extractionRoomId) {
      progress.add("extract");
    }

    agentProgress[agentId] = progress;
  }

  return { steps, agentProgress };
}

const ALERT_LEVELS: { label: string; color: string }[] = [
  { label: "CLEAR", color: "#22c55e" },
  { label: "CAUTION", color: "#eab308" },
  { label: "ALERT", color: "#f97316" },
  { label: "LOCKDOWN", color: "#ef4444" },
];

export function selectAlertLevel(state: HeistSceneState): AlertDisplay {
  const level = Math.min(Math.max(state.sceneFacts?.alertLevel ?? 0, 0), 3);
  const maxLevel = state.scenarioParams?.maxAlertLevel ?? 3;
  const info = ALERT_LEVELS[level] ?? ALERT_LEVELS[0];
  return { level, maxLevel, label: info.label, color: info.color };
}

export function selectTerminals(state: HeistSceneState): TerminalDisplay[] {
  return Object.values(state.entities)
    .filter((e) => e.kind === "terminal")
    .map((entity) => {
      const hackProgress =
        typeof entity.state?.progress === "number" ? (entity.state.progress as number) : 0;
      const hackRequired =
        typeof entity.state?.hackTurns === "number" ? (entity.state.hackTurns as number) : 2;
      const isHacked = entity.state?.hacked === true || hackProgress >= hackRequired;

      return {
        id: entity.entityId,
        label: entity.label ?? entity.entityId,
        hackProgress,
        hackRequired,
        isHacked,
      };
    });
}

export function selectDoors(state: HeistSceneState): DoorDisplay[] {
  return Object.values(state.map.doors).map((door) => {
    const roomALabel = state.map.rooms[door.from]?.label ?? door.from;
    const roomBLabel = state.map.rooms[door.to]?.label ?? door.to;

    return {
      id: door.doorId,
      label: `${roomALabel} \u2194 ${roomBLabel}`,
      roomA: door.from,
      roomB: door.to,
      isLocked: door.isLocked ?? false,
    };
  });
}

// ---- Moments ----

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

type HeistMomentDefinition = {
  id: HeistMomentId;
  register: MomentRegister;
  priority: number;
};

/**
 * Mapping from heist feedback codes to moment types.
 * Source: src/scenarios/heist/feedbackCodes.ts + src/scenarios/heist/index.ts.
 */
const HEIST_FEEDBACK_MOMENTS: Record<string, HeistMomentDefinition> = {
  [HEIST_ERROR_CODES.invalid_move_target]: {
    id: "misnavigation",
    register: "failure",
    priority: 90,
  },
  [HEIST_ERROR_CODES.no_door_between_rooms]: {
    id: "misnavigation",
    register: "failure",
    priority: 90,
  },
  [HEIST_ERROR_CODES.missing_required_item]: {
    id: "locked_door",
    register: "failure",
    priority: 80,
  },
  [HEIST_ERROR_CODES.door_locked]: {
    id: "locked_door",
    register: "failure",
    priority: 80,
  },
  [HEIST_ERROR_CODES.item_not_in_room]: {
    id: "interaction_snag",
    register: "failure",
    priority: 70,
  },
  [HEIST_ERROR_CODES.invalid_item_id]: {
    id: "interaction_snag",
    register: "failure",
    priority: 70,
  },
  [HEIST_ERROR_CODES.unknown_item]: {
    id: "interaction_snag",
    register: "failure",
    priority: 70,
  },
  [HEIST_ERROR_CODES.invalid_terminal_id]: {
    id: "interaction_snag",
    register: "failure",
    priority: 70,
  },
  [HEIST_ERROR_CODES.terminal_not_in_room]: {
    id: "interaction_snag",
    register: "failure",
    priority: 70,
  },
  [HEIST_ERROR_CODES.not_in_extraction_room]: {
    id: "premature_extraction",
    register: "failure",
    priority: 85,
  },
  [HEIST_ERROR_CODES.invalid_action_payload]: {
    id: "schema_fumble",
    register: "failure",
    priority: 95,
  },
  [HEIST_ERROR_CODES.invalid_action_type]: {
    id: "schema_fumble",
    register: "failure",
    priority: 95,
  },
  [HEIST_ERROR_CODES.unknown_agent]: {
    id: "schema_fumble",
    register: "failure",
    priority: 95,
  },
  [HEIST_ERROR_CODES.agent_already_extracted]: {
    id: "premature_extraction",
    register: "failure",
    priority: 75,
  },
  [HEIST_RESULT_CODES.hack_complete]: {
    id: "terminal_hacked",
    register: "progress",
    priority: 60,
  },
  [HEIST_RESULT_CODES.hack_progress]: {
    id: "terminal_progress",
    register: "progress",
    priority: 40,
  },
  [HEIST_RESULT_CODES.item_pickup]: {
    id: "item_acquired",
    register: "progress",
    priority: 55,
  },
  [HEIST_RESULT_CODES.extraction_success]: {
    id: "clean_extraction",
    register: "progress",
    priority: 70,
  },
};

type HeistMomentContext = {
  agentId?: string;
  agentLabel?: string;
  actionType?: string;
  errorCode?: string;
  resultCode?: string;
  message?: string;
  currentRoomId?: string;
  currentRoomLabel?: string;
  targetRoomId?: string;
  targetRoomLabel?: string;
  doorId?: string;
  doorLabel?: string;
  requiredItemId?: string;
  requiredItemLabel?: string;
  targetId?: string;
  targetLabel?: string;
  terminalId?: string;
  terminalLabel?: string;
  itemId?: string;
  itemLabel?: string;
  itemType?: string;
  hackProgress?: number;
  hackRequired?: number;
  extractionRoomId?: string;
  extractionRoomLabel?: string;
  fallbackReason?: string;
  alertLevelBefore?: number;
  alertLevelAfter?: number;
};

const roomLabel = (state: HeistSceneState, roomId?: string): string | undefined => {
  if (!roomId) {
    return undefined;
  }
  return state.map.rooms[roomId]?.label ?? roomId;
};

const doorLabel = (state: HeistSceneState, doorId?: string): string | undefined => {
  if (!doorId) {
    return undefined;
  }
  const door = state.map.doors[doorId];
  if (!door) {
    return doorId;
  }
  const from = roomLabel(state, door.from) ?? door.from;
  const to = roomLabel(state, door.to) ?? door.to;
  return `${from} \u2194 ${to}`;
};

const itemLabel = (state: HeistSceneState, itemId?: string): string | undefined => {
  if (!itemId) {
    return undefined;
  }
  return state.items[itemId]?.label ?? itemId;
};

const terminalLabel = (state: HeistSceneState, terminalId?: string): string | undefined => {
  if (!terminalId) {
    return undefined;
  }
  return state.entities[terminalId]?.label ?? terminalId;
};

function buildHeistMomentContext(
  event: ActionAdjudicatedEvent,
  state: HeistSceneState,
  previousState?: HeistSceneState,
): HeistMomentContext {
  const feedback = isRecord(event.feedback) ? event.feedback : undefined;
  const action = isRecord(event.chosenAction) ? event.chosenAction : undefined;
  const agent = state.agents[event.agentId];
  const currentRoomId = agent?.roomId;
  const targetRoomId = asString(action?.toRoomId);
  const doorId = asString(feedback?.doorId);
  const requiredItemId = asString(feedback?.requiredItem);
  const targetId =
    asString(action?.itemId) ?? asString(action?.terminalId) ?? asString(action?.target);
  const terminalId = asString(action?.terminalId) ?? asString(feedback?.terminalId);
  const itemId = asString(action?.itemId) ?? asString(feedback?.itemId);
  const extractionRoomId =
    asString(feedback?.extractionRoomId) ?? state.scenarioParams?.extractionRoomId;
  const hackProgress = asNumber(feedback?.progress);
  const hackRequired = asNumber(feedback?.hackRequired);
  const alertLevelBefore = previousState?.sceneFacts?.alertLevel;
  const alertLevelAfter = state.sceneFacts?.alertLevel;

  return {
    agentId: event.agentId,
    agentLabel: event.agentId,
    actionType: asString(action?.type),
    errorCode: asString(feedback?.error),
    resultCode: asString(feedback?.result),
    message: asString(feedback?.message),
    currentRoomId,
    currentRoomLabel: roomLabel(state, currentRoomId),
    targetRoomId,
    targetRoomLabel: roomLabel(state, targetRoomId),
    doorId,
    doorLabel: doorLabel(state, doorId),
    requiredItemId,
    requiredItemLabel: itemLabel(state, requiredItemId),
    targetId,
    targetLabel:
      itemLabel(state, targetId) ??
      terminalLabel(state, targetId) ??
      (targetId ? targetId : undefined),
    terminalId,
    terminalLabel: terminalLabel(state, terminalId),
    itemId,
    itemLabel: itemLabel(state, itemId),
    itemType: state.items[itemId ?? ""]?.kind,
    hackProgress,
    hackRequired,
    extractionRoomId,
    extractionRoomLabel: roomLabel(state, extractionRoomId),
    fallbackReason: event.fallbackReason ?? undefined,
    alertLevelBefore,
    alertLevelAfter,
  };
}

export function adjudicationToMomentCandidate(
  event: ActionAdjudicatedEvent,
  state: HeistSceneState,
  previousState?: HeistSceneState,
): HeistMomentCandidate | null {
  const feedback = isRecord(event.feedback) ? event.feedback : undefined;
  const errorCode = asString(feedback?.error);
  const resultCode = asString(feedback?.result);
  const fallbackReason = event.fallbackReason;
  const context = buildHeistMomentContext(event, state, previousState);

  if (fallbackReason) {
    return {
      id: "schema_fumble",
      register: "failure",
      priority: 95,
      turn: event.turn,
      agentId: event.agentId,
      seqRange: { start: event.seq, end: event.seq },
      context: {
        ...context,
        fallbackReason,
      },
    };
  }

  if (!event.valid && errorCode) {
    const definition = HEIST_FEEDBACK_MOMENTS[errorCode];
    if (!definition) {
      return null;
    }
    return {
      id: definition.id,
      register: definition.register,
      priority: definition.priority,
      turn: event.turn,
      agentId: event.agentId,
      seqRange: { start: event.seq, end: event.seq },
      context,
    };
  }

  if (event.valid && resultCode) {
    const definition = HEIST_FEEDBACK_MOMENTS[resultCode];
    if (!definition) {
      return null;
    }
    return {
      id: definition.id,
      register: definition.register,
      priority: definition.priority,
      turn: event.turn,
      agentId: event.agentId,
      seqRange: { start: event.seq, end: event.seq },
      context,
    };
  }

  return null;
}

export type MomentDetectorState = {
  guardClosingCooldown: Record<string, number>;
  stalledTurns: number;
  noiseCreepFired: Record<number, Set<number>>;
  lastGuardRooms: Record<string, string | undefined>;
  lastAgentId?: string;
};

export const createMomentDetectorState = (): MomentDetectorState => ({
  guardClosingCooldown: {},
  stalledTurns: 0,
  noiseCreepFired: {},
  lastGuardRooms: {},
  lastAgentId: undefined,
});

const buildAdjacencyMap = (state: HeistSceneState): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>();
  for (const door of Object.values(state.map.doors)) {
    if (!adjacency.has(door.from)) {
      adjacency.set(door.from, new Set());
    }
    if (!adjacency.has(door.to)) {
      adjacency.set(door.to, new Set());
    }
    adjacency.get(door.from)?.add(door.to);
    adjacency.get(door.to)?.add(door.from);
  }
  return adjacency;
};

const createCandidate = (
  base: Omit<HeistMomentCandidate, "context"> & { context?: Record<string, unknown> },
): HeistMomentCandidate => ({
  ...base,
  context: base.context ?? {},
});

export function runHeistStatefulDetectors(params: {
  state: HeistSceneState;
  turn: number;
  seq: number;
  candidatesThisTurn: HeistMomentCandidate[];
  detectorState: MomentDetectorState;
}): HeistMomentCandidate[] {
  const { state, turn, seq, candidatesThisTurn, detectorState } = params;
  const results: HeistMomentCandidate[] = [];
  const agentIds = Object.keys(state.agents);
  const fallbackAgentId = detectorState.lastAgentId ?? agentIds[0] ?? "team";

  // guard_closing
  const adjacency = buildAdjacencyMap(state);
  for (const guard of Object.values(state.guards)) {
    if (!guard.roomId) {
      continue;
    }
    const lastTriggered = detectorState.guardClosingCooldown[guard.guardId];
    if (lastTriggered !== undefined && turn - lastTriggered < 3) {
      continue;
    }
    const neighbors = adjacency.get(guard.roomId) ?? new Set<string>();
    const threatenedAgent = agentIds.find((agentId) => {
      const agentRoom = state.agents[agentId]?.roomId;
      return agentRoom ? neighbors.has(agentRoom) : false;
    });
    if (threatenedAgent) {
      results.push(
        createCandidate({
          id: "guard_closing",
          register: "tension",
          priority: 85,
          turn,
          agentId: threatenedAgent,
          seqRange: { start: seq, end: seq },
          context: {
            guardId: guard.guardId,
            guardLabel: guard.guardId,
            guardRoomId: guard.roomId,
            guardRoomLabel: roomLabel(state, guard.roomId),
            agentRoomId: state.agents[threatenedAgent]?.roomId,
            agentRoomLabel: roomLabel(state, state.agents[threatenedAgent]?.roomId),
          },
        }),
      );
      detectorState.guardClosingCooldown[guard.guardId] = turn;
    }
  }

  // stalled_objective
  const hadProgress = candidatesThisTurn.some((candidate) => candidate.register === "progress");
  if (hadProgress) {
    detectorState.stalledTurns = 0;
  } else {
    detectorState.stalledTurns += 1;
    if (detectorState.stalledTurns % 3 === 0) {
      results.push(
        createCandidate({
          id: "stalled_objective",
          register: "tension",
          priority: 70,
          turn,
          agentId: fallbackAgentId,
          seqRange: { start: seq, end: seq },
          context: {
            stalledTurns: detectorState.stalledTurns,
          },
        }),
      );
    }
  }

  // noise_creep (only if noise + alert thresholds are present in show-layer state)
  const noise = state.sceneFacts?.noise;
  const alertLevel = state.sceneFacts?.alertLevel ?? 0;
  const thresholds = state.scenarioParams?.alertThresholds ?? [];
  const currentThreshold = thresholds[alertLevel];
  const nextThreshold = thresholds[alertLevel + 1];
  if (
    typeof noise === "number" &&
    typeof currentThreshold === "number" &&
    typeof nextThreshold === "number" &&
    nextThreshold > currentThreshold
  ) {
    const ratio = (noise - currentThreshold) / (nextThreshold - currentThreshold);
    const fired = detectorState.noiseCreepFired[alertLevel] ?? new Set<number>();
    const queue: number[] = [];
    if (ratio >= 0.5 && !fired.has(0.5)) {
      queue.push(0.5);
      fired.add(0.5);
    }
    if (ratio >= 0.75 && !fired.has(0.75)) {
      queue.push(0.75);
      fired.add(0.75);
    }
    if (queue.length > 0) {
      detectorState.noiseCreepFired[alertLevel] = fired;
      for (const thresholdRatio of queue) {
        results.push(
          createCandidate({
            id: "noise_creep",
            register: "tension",
            priority: 75,
            turn,
            agentId: fallbackAgentId,
            seqRange: { start: seq, end: seq },
            context: {
              noise,
              alertLevel,
              thresholdRatio,
              noisePercent: Math.round(ratio * 100),
              nextThreshold,
            },
          }),
        );
      }
    }
  }

  // near_miss
  const detectionThisTurn = candidatesThisTurn.some((candidate) => {
    const context = candidate.context as Record<string, unknown> | undefined;
    if (!context || !Object.prototype.hasOwnProperty.call(context, "detectionEvent")) {
      return false;
    }
    return context.detectionEvent !== false;
  });
  const emittedNearMiss = new Set<string>();
  for (const guard of Object.values(state.guards)) {
    const guardRoom = guard.roomId;
    if (!guardRoom) {
      continue;
    }
    const previousGuardRoom = detectorState.lastGuardRooms[guard.guardId];
    for (const agentId of agentIds) {
      const agentRoom = state.agents[agentId]?.roomId;
      if (!agentRoom || detectionThisTurn) {
        continue;
      }
      const shareRoom = guardRoom === agentRoom;
      const movedThrough =
        previousGuardRoom === agentRoom && guardRoom !== agentRoom && previousGuardRoom !== undefined;
      if ((shareRoom || movedThrough) && !emittedNearMiss.has(`${guard.guardId}:${agentId}`)) {
        results.push(
          createCandidate({
            id: "near_miss",
            register: "tension",
            priority: 80,
            turn,
            agentId,
            seqRange: { start: seq, end: seq },
            context: {
              guardId: guard.guardId,
              guardLabel: guard.guardId,
              guardRoomId: guardRoom,
              guardRoomLabel: roomLabel(state, guardRoom),
              agentRoomId: agentRoom,
              agentRoomLabel: roomLabel(state, agentRoom),
            },
          }),
        );
        emittedNearMiss.add(`${guard.guardId}:${agentId}`);
      }
    }
  }
  for (const guard of Object.values(state.guards)) {
    detectorState.lastGuardRooms[guard.guardId] = guard.roomId;
  }

  return results;
}

export function selectHeistMomentCandidates(events: MatchEvent[]): HeistMomentCandidate[] {
  let sceneState: HeistSceneState | undefined;
  let previousState: HeistSceneState | undefined;
  const detectorState = createMomentDetectorState();
  const candidates: HeistMomentCandidate[] = [];
  const candidatesByTurn = new Map<number, HeistMomentCandidate[]>();
  let lastProcessedTurn = -1;

  const recordCandidate = (candidate: HeistMomentCandidate) => {
    candidates.push(candidate);
    const list = candidatesByTurn.get(candidate.turn) ?? [];
    list.push(candidate);
    candidatesByTurn.set(candidate.turn, list);
  };

  for (const event of events) {
    previousState = sceneState;
    sceneState = reduceHeistEvent(sceneState, event);

    if (!sceneState) {
      continue;
    }

    if (event.type === "ActionAdjudicated") {
      detectorState.lastAgentId = event.agentId;
      const candidate = adjudicationToMomentCandidate(
        event as ActionAdjudicatedEvent,
        sceneState,
        previousState,
      );
      if (candidate) {
        recordCandidate(candidate);
      }
    }

    if (event.type === "StateUpdated") {
      if (event.turn === lastProcessedTurn) {
        continue;
      }
      const turnCandidates = candidatesByTurn.get(event.turn) ?? [];
      const stateful = runHeistStatefulDetectors({
        state: sceneState,
        turn: event.turn,
        seq: event.seq,
        candidatesThisTurn: turnCandidates,
        detectorState,
      });
      for (const candidate of stateful) {
        recordCandidate(candidate);
      }
      lastProcessedTurn = event.turn;
    }
  }

  if (sceneState && sceneState.turn.current !== lastProcessedTurn) {
    const turn = sceneState.turn.current;
    const turnCandidates = candidatesByTurn.get(turn) ?? [];
    const seq = sceneState.lastEventSeq ?? 0;
    const stateful = runHeistStatefulDetectors({
      state: sceneState,
      turn,
      seq,
      candidatesThisTurn: turnCandidates,
      detectorState,
    });
    for (const candidate of stateful) {
      recordCandidate(candidate);
    }
  }

  return candidates;
}
