import type { AdjudicationResult, Scenario } from "../../contract/interfaces.js";
import type { AgentId, JsonValue, Seed } from "../../contract/types.js";
import type {
  HeistAction,
  HeistDoor,
  HeistEntity,
  HeistItem,
  HeistMap,
  HeistScenarioParams,
  HeistTerminalEntity,
} from "../../games/heist/types.js";
import { HEIST_ERROR_CODES, HEIST_RESULT_CODES, type HeistErrorCode } from "./feedbackCodes.js";
import { getHeistBriefing } from "./briefing.js";

// ---------------------------------------------------------------------------
// State & observation types
// ---------------------------------------------------------------------------

export interface HeistAgentState {
  roomId: string;
  inventory: string[];
  score: number;
  extracted: boolean;
}

export interface HeistState {
  params: HeistScenarioParams;
  agentIds: AgentId[];
  agents: Record<AgentId, HeistAgentState>;
  itemLocations: Record<string, string | null>;
  terminalProgress: Record<string, number>;
  terminalHacked: Record<string, boolean>;
  alertLevel: number;
  turn: number;
}

export interface HeistObservation {
  currentRoomId: string;
  adjacentRooms: {
    roomId: string;
    doorId: string;
    locked: boolean;
    requiredItem?: string;
    passable: boolean;
  }[];
  visibleItems: HeistItem[];
  visibleEntities: HeistEntity[];
  inventory: { itemId: string; type: HeistItem["type"] }[];
  turn: number;
  _private: {
    map: HeistMap;
    entities: HeistEntity[];
    items: HeistItem[];
    alertLevel: number;
    extractionRoomId: string;
    terminalProgress: Record<string, number>;
    terminalHacked: Record<string, boolean>;
    invalidActionFallback?: HeistAction;
  };
}

export type { HeistAction };

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_HEIST_PARAMS: HeistScenarioParams = {
  map: {
    rooms: [
      { id: "room-1", type: "spawn" },
      { id: "room-2", type: "hallway" },
      { id: "room-3", type: "vault" },
      { id: "room-4", type: "extraction" },
    ],
    doors: [
      { id: "door-1", roomA: "room-1", roomB: "room-2" },
      {
        id: "door-2",
        roomA: "room-2",
        roomB: "room-3",
        locked: true,
        requiredItem: "keycard-1",
      },
      {
        id: "door-3",
        roomA: "room-3",
        roomB: "room-4",
        locked: true,
        requiredItem: "intel-1",
      },
    ],
  },
  entities: [
    {
      id: "terminal-1",
      type: "terminal",
      roomId: "room-2",
      hackTurns: 2,
      successGrants: ["intel-1"],
    },
    {
      id: "vault-1",
      type: "vault",
      roomId: "room-3",
      requiredItems: ["keycard-1"],
    },
  ],
  items: [
    { id: "keycard-1", type: "keycard", roomId: "room-1" },
    { id: "loot-1", type: "loot", roomId: "room-3", scoreValue: 50 },
    { id: "intel-1", type: "intel", label: "Vault access codes" },
  ],
  rules: {
    noiseTable: { move: 1, hack: 2, wait: 0 },
    alertThresholds: [0, 3, 6, 10],
    noiseDecayRate: 1,
    guardDetectionRange: 2,
    maxAlertLevel: 3,
    captureOnMaxAlert: false,
  },
  scoring: {
    objectiveSecured: 100,
    extractionBonus: 50,
    turnsRemainingMultiplier: 1,
    lootMultiplier: 1,
    alertPenaltyPerLevel: 5,
    invalidActionPenalty: 5,
  },
  winCondition: {
    requiredObjectives: ["loot-1"],
    extractionRoomId: "room-4",
    maxTurns: 20,
    maxAlertLevel: 3,
  },
  skin: {
    themeName: "Vault Run",
    flavorText: "Grab the loot, crack the terminal, and escape clean.",
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHeistScenario(
  params: HeistScenarioParams = DEFAULT_HEIST_PARAMS,
): Scenario<HeistState, HeistObservation, HeistAction> {
  return {
    name: "Heist",

    init(_seed: Seed, agentIds: AgentId[]): HeistState {
      const spawnRoomId =
        params.map.rooms.find((room) => room.type === "spawn")?.id ??
        params.map.rooms[0]?.id ??
        "spawn";

      const agents: Record<AgentId, HeistAgentState> = {};
      for (const id of agentIds) {
        agents[id] = {
          roomId: spawnRoomId,
          inventory: [],
          score: 0,
          extracted: false,
        };
      }

      const itemLocations: Record<string, string | null> = {};
      for (const item of params.items) {
        if ("roomId" in item) {
          itemLocations[item.id] = item.roomId;
        } else {
          itemLocations[item.id] = null;
        }
      }

      const terminalProgress: Record<string, number> = {};
      const terminalHacked: Record<string, boolean> = {};
      for (const entity of params.entities) {
        if (entity.type === "terminal") {
          terminalProgress[entity.id] = 0;
          terminalHacked[entity.id] = false;
        }
      }

      return {
        params,
        agentIds: [...agentIds],
        agents,
        itemLocations,
        terminalProgress,
        terminalHacked,
        alertLevel: 0,
        turn: 0,
      };
    },

    observe(state: HeistState, agentId: AgentId): HeistObservation {
      const agent = state.agents[agentId];
      const inventorySet = new Set(agent.inventory);
      const doors = state.params.map.doors;
      const itemsById = new Map(state.params.items.map((item) => [item.id, item]));

      const adjacentRooms = doors
        .filter((door) => door.roomA === agent.roomId || door.roomB === agent.roomId)
        .map((door) => {
          const roomId = door.roomA === agent.roomId ? door.roomB : door.roomA;
          return {
            roomId,
            doorId: door.id,
            locked: door.locked ?? false,
            passable: isDoorPassable(door, inventorySet),
            ...(door.requiredItem !== undefined && { requiredItem: door.requiredItem }),
          };
        });

      const visibleItems: HeistItem[] = [];
      for (const [itemId, location] of Object.entries(state.itemLocations)) {
        if (location === agent.roomId) {
          const item = itemsById.get(itemId);
          if (item) {
            visibleItems.push(item);
          }
        }
      }

      // TODO(hashmatch): Implement guard detection mechanics
      // Context: Guards have patrolRoute and detectionRange defined in HeistGuardEntity
      // but are currently excluded from observations and do not trigger detection events.
      // Guards should be visible when in the agent's room or within detectionRange,
      // and should trigger alert escalation when detecting the agent per heist_game_contract_v0.md §5.
      // Verify: Add tests that guards in the same room as the agent trigger detection
      const visibleEntities = state.params.entities.filter((entity) => {
        if (entity.type === "guard") {
          return false;
        }
        return entity.roomId === agent.roomId;
      });

      const inventory = agent.inventory
        .map((itemId) => {
          const item = itemsById.get(itemId);
          if (!item) {
            return null;
          }
          return { itemId, type: item.type };
        })
        .filter((entry): entry is { itemId: string; type: HeistItem["type"] } => Boolean(entry));

      return {
        currentRoomId: agent.roomId,
        adjacentRooms,
        visibleItems,
        visibleEntities,
        inventory,
        turn: state.turn,
        _private: {
          map: state.params.map,
          entities: state.params.entities,
          items: state.params.items,
          alertLevel: state.alertLevel,
          extractionRoomId: state.params.winCondition.extractionRoomId,
          terminalProgress: { ...state.terminalProgress },
          terminalHacked: { ...state.terminalHacked },
          ...(state.params.rules.invalidActionFallback
            ? { invalidActionFallback: state.params.rules.invalidActionFallback }
            : {}),
        },
      };
    },

    // TODO(hashmatch): Implement per-action noise tracking using rules.noiseTable
    // Context: The noiseTable, alertThresholds, and noiseDecayRate are defined in HeistRules
    // but not used during adjudication. Currently, alertLevel only increments on invalid actions.
    // Each valid action should generate noise per noiseTable, noise should accumulate with decay,
    // and alertLevel should be derived from alertThresholds crossings.
    // Verify: tests/heist-scenario.test.ts should test that move actions generate noise=1 per default noiseTable
    adjudicate(
      state: HeistState,
      agentId: AgentId,
      action: HeistAction,
    ): AdjudicationResult<HeistState> {
      const agent = state.agents[agentId];
      if (!agent) {
        return invalidAction(state, agentId, HEIST_ERROR_CODES.unknown_agent, "Unknown agent.");
      }

      if (!isActionObject(action)) {
        return invalidAction(
          state,
          agentId,
          HEIST_ERROR_CODES.invalid_action_payload,
          "Invalid action payload.",
        );
      }

      if (agent.extracted && action.type !== "wait") {
        return invalidAction(
          state,
          agentId,
          HEIST_ERROR_CODES.agent_already_extracted,
          "Agent already extracted.",
        );
      }

      switch (action.type) {
        case "wait":
          return {
            valid: true,
            state: advanceTurn(state),
            feedback: { message: "Waited." },
          };
        case "move":
          return adjudicateMove(state, agentId, action.toRoomId);
        case "pickup":
          return adjudicatePickup(state, agentId, action.itemId);
        case "use_terminal":
          return adjudicateTerminal(state, agentId, action.terminalId);
        case "extract":
          return adjudicateExtract(state, agentId);
        default:
          return invalidAction(
            state,
            agentId,
            HEIST_ERROR_CODES.invalid_action_type,
            "Unknown action type.",
            { actionType: (action as HeistAction).type },
          );
      }
    },

    // TODO(hashmatch): Check captureOnMaxAlert in isTerminal
    // Context: rules.captureOnMaxAlert is defined in HeistRules and defaults to false.
    // When true, reaching maxAlertLevel should end the match immediately (capture/lockdown).
    // Currently isTerminal does not check alertLevel at all.
    // Verify: tests/heist-scenario.test.ts should test that captureOnMaxAlert=true ends match at max alert
    isTerminal(state: HeistState): boolean {
      if (state.turn >= state.params.winCondition.maxTurns) {
        return true;
      }

      const allExtracted = state.agentIds.every((id) => state.agents[id]?.extracted);
      if (allExtracted) {
        return true;
      }

      return state.agentIds.some((id) => {
        const agent = state.agents[id];
        if (!agent?.extracted) {
          return false;
        }
        return hasRequiredObjectives(state, agent);
      });
    },

    score(state: HeistState): Record<AgentId, number> {
      const scores: Record<AgentId, number> = {};
      for (const id of state.agentIds) {
        const agent = state.agents[id];
        if (!agent) {
          scores[id] = 0;
          continue;
        }
        scores[id] = computeScore(state, agent);
      }
      return scores;
    },

    summarize(state: HeistState): JsonValue {
      const agents: Record<string, JsonValue> = {};
      for (const id of state.agentIds) {
        const agent = state.agents[id];
        agents[id] = {
          roomId: agent.roomId,
          score: agent.score,
          extracted: agent.extracted,
        };
      }
      const sharedInventory = new Set<string>();
      for (const id of state.agentIds) {
        const agent = state.agents[id];
        for (const itemId of agent.inventory) {
          sharedInventory.add(itemId);
        }
      }

      const requiredObjectives = state.params.winCondition.requiredObjectives;
      const objectives: Record<string, JsonValue> = {};
      for (const objectiveId of requiredObjectives) {
        objectives[objectiveId] = {
          secured: sharedInventory.has(objectiveId),
        };
      }
      const extractedAgents = state.agentIds.filter((id) => state.agents[id]?.extracted);

      const guards: Record<string, JsonValue> = {};
      for (const entity of state.params.entities) {
        if (entity.type !== "guard") {
          continue;
        }
        const route = entity.patrolRoute;
        if (route.length === 0) {
          continue;
        }
        const patrolIndex = state.turn % route.length;
        guards[entity.id] = {
          roomId: route[patrolIndex],
          patrolIndex,
          routeLength: route.length,
          detectionRange: entity.detectionRange,
        };
      }

      const doors: Record<string, JsonValue> = {};
      for (const door of state.params.map.doors) {
        doors[door.id] = {
          locked: door.locked ?? false,
          requiredItem: door.requiredItem ?? null,
          accessible: isDoorPassable(door, sharedInventory),
        };
      }

      const terminals: Record<string, JsonValue> = {};
      const vaults: Record<string, JsonValue> = {};
      for (const entity of state.params.entities) {
        if (entity.type === "terminal") {
          terminals[entity.id] = {
            roomId: entity.roomId,
            progress: state.terminalProgress[entity.id] ?? 0,
            hacked: state.terminalHacked[entity.id] ?? false,
          };
        }
        if (entity.type === "vault") {
          const requiredItems = entity.requiredItems ?? [];
          const requirementsMet = requiredItems.every((itemId) => sharedInventory.has(itemId));
          vaults[entity.id] = {
            roomId: entity.roomId,
            requiredItems,
            requirementsMet,
          };
        }
      }

      const maxAlertLevel = state.params.rules.maxAlertLevel;
      const tension = maxAlertLevel > 0 ? Math.min(1, state.alertLevel / maxAlertLevel) : 0;
      return {
        turn: state.turn,
        alertLevel: state.alertLevel,
        tension,
        maxAlertLevel,
        agents,
        guards,
        doors,
        terminals,
        vaults,
        objectives,
        extractedAgents,
      };
    },

    getDefaultAction(): HeistAction {
      return { type: "wait" };
    },

    getBriefing: getHeistBriefing,

    reveal(state: HeistState): JsonValue {
      return {
        params: state.params as unknown as JsonValue,
        turn: state.turn,
        alertLevel: state.alertLevel,
        agents: state.agentIds.map((id) => ({
          agentId: id,
          roomId: state.agents[id]?.roomId,
          inventory: state.agents[id]?.inventory,
          score: state.agents[id]?.score,
          extracted: state.agents[id]?.extracted,
        })),
        itemLocations: { ...state.itemLocations },
        terminalProgress: { ...state.terminalProgress },
        terminalHacked: { ...state.terminalHacked },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

function adjudicateMove(
  state: HeistState,
  agentId: AgentId,
  toRoomId: string,
): AdjudicationResult<HeistState> {
  if (typeof toRoomId !== "string" || toRoomId.length === 0) {
    return invalidAction(
      state,
      agentId,
      HEIST_ERROR_CODES.invalid_move_target,
      "Invalid move target.",
    );
  }

  const agent = state.agents[agentId];
  const door = findDoorBetween(state.params.map.doors, agent.roomId, toRoomId);
  if (!door) {
    return invalidAction(
      state,
      agentId,
      HEIST_ERROR_CODES.no_door_between_rooms,
      "No door connects those rooms.",
      { fromRoomId: agent.roomId, toRoomId },
    );
  }

  const inventory = new Set(agent.inventory);
  if (!isDoorPassable(door, inventory)) {
    if (door.requiredItem && !inventory.has(door.requiredItem)) {
      return invalidAction(
        state,
        agentId,
        HEIST_ERROR_CODES.missing_required_item,
        "Missing required item for this door.",
        {
          doorId: door.id,
          requiredItem: door.requiredItem,
          fromRoomId: agent.roomId,
          toRoomId,
        },
      );
    }

    return invalidAction(state, agentId, HEIST_ERROR_CODES.door_locked, "Door is locked.", {
      doorId: door.id,
      fromRoomId: agent.roomId,
      toRoomId,
    });
  }

  const nextState = advanceTurn(state);
  return {
    valid: true,
    state: updateAgent(nextState, agentId, {
      roomId: toRoomId,
    }),
    feedback: {
      result: HEIST_RESULT_CODES.moved,
      message: `Moved to ${toRoomId}.`,
      toRoomId,
      doorId: door.id,
    },
  };
}

function adjudicatePickup(
  state: HeistState,
  agentId: AgentId,
  itemId: string,
): AdjudicationResult<HeistState> {
  if (typeof itemId !== "string" || itemId.length === 0) {
    return invalidAction(state, agentId, HEIST_ERROR_CODES.invalid_item_id, "Invalid item id.");
  }

  const agent = state.agents[agentId];
  const location = state.itemLocations[itemId];
  if (location !== agent.roomId) {
    return invalidAction(
      state,
      agentId,
      HEIST_ERROR_CODES.item_not_in_room,
      "Item not present in this room.",
      { itemId, currentRoomId: agent.roomId },
    );
  }

  const item = state.params.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return invalidAction(state, agentId, HEIST_ERROR_CODES.unknown_item, "Unknown item.", {
      itemId,
    });
  }

  const nextState = advanceTurn(state);
  const updatedInventory = addUnique(agent.inventory, itemId);
  const updatedScore =
    item.type === "loot"
      ? agent.score + item.scoreValue * state.params.scoring.lootMultiplier
      : agent.score;

  return {
    valid: true,
    state: {
      ...updateAgent(nextState, agentId, {
        inventory: updatedInventory,
        score: updatedScore,
      }),
      itemLocations: {
        ...nextState.itemLocations,
        [itemId]: null,
      },
    },
    feedback: {
      result: HEIST_RESULT_CODES.item_pickup,
      message: `Picked up ${itemId}.`,
      itemId,
      itemType: item.type,
    },
  };
}

function adjudicateTerminal(
  state: HeistState,
  agentId: AgentId,
  terminalId: string,
): AdjudicationResult<HeistState> {
  if (typeof terminalId !== "string" || terminalId.length === 0) {
    return invalidAction(
      state,
      agentId,
      HEIST_ERROR_CODES.invalid_terminal_id,
      "Invalid terminal id.",
    );
  }

  const agent = state.agents[agentId];
  const terminal = state.params.entities.find(
    (entity): entity is HeistTerminalEntity =>
      entity.type === "terminal" && entity.id === terminalId,
  );

  if (!terminal || terminal.roomId !== agent.roomId) {
    return invalidAction(
      state,
      agentId,
      HEIST_ERROR_CODES.terminal_not_in_room,
      "Terminal not available in this room.",
      { terminalId, currentRoomId: agent.roomId },
    );
  }

  const nextState = advanceTurn(state);
  const currentProgress = nextState.terminalProgress[terminalId] ?? 0;
  const nextProgress = currentProgress + 1;
  const terminalAlreadyHacked = nextState.terminalHacked[terminalId] ?? false;
  const hackRequired = terminal.hackTurns;

  let updatedInventory = agent.inventory;
  let hacked = terminalAlreadyHacked;
  const grantedItems: string[] = [];
  const willHack = !terminalAlreadyHacked && nextProgress >= terminal.hackTurns;

  if (willHack) {
    hacked = true;
    for (const grant of terminal.successGrants ?? []) {
      updatedInventory = addUnique(updatedInventory, grant);
      grantedItems.push(grant);
    }
  }

  return {
    valid: true,
    state: {
      ...updateAgent(nextState, agentId, { inventory: updatedInventory }),
      terminalProgress: {
        ...nextState.terminalProgress,
        [terminalId]: nextProgress,
      },
      terminalHacked: {
        ...nextState.terminalHacked,
        [terminalId]: hacked,
      },
    },
    feedback: {
      result: willHack ? HEIST_RESULT_CODES.hack_complete : HEIST_RESULT_CODES.hack_progress,
      message: willHack
        ? "Terminal hacked successfully."
        : `Terminal hack progress ${nextProgress}/${hackRequired}.`,
      terminalId,
      progress: nextProgress,
      hackRequired,
      hacked,
      ...(grantedItems.length > 0 ? { grantedItems } : {}),
    },
  };
}

function adjudicateExtract(state: HeistState, agentId: AgentId): AdjudicationResult<HeistState> {
  const agent = state.agents[agentId];
  if (agent.roomId !== state.params.winCondition.extractionRoomId) {
    return invalidAction(
      state,
      agentId,
      HEIST_ERROR_CODES.not_in_extraction_room,
      "Not in extraction room.",
      {
        currentRoomId: agent.roomId,
        extractionRoomId: state.params.winCondition.extractionRoomId,
      },
    );
  }

  const nextState = advanceTurn(state);
  return {
    valid: true,
    state: updateAgent(nextState, agentId, { extracted: true }),
    feedback: {
      result: HEIST_RESULT_CODES.extraction_success,
      message: "Extraction successful.",
      extracted: true,
      extractionRoomId: state.params.winCondition.extractionRoomId,
    },
  };
}

function invalidAction(
  state: HeistState,
  agentId: AgentId,
  error: HeistErrorCode,
  message: string,
  details?: Record<string, unknown>,
): AdjudicationResult<HeistState> {
  return {
    valid: false,
    state: applyInvalidPenalty(advanceTurn(state), agentId),
    feedback: {
      error,
      message,
      ...(details ?? {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isActionObject(action: unknown): action is HeistAction {
  return typeof action === "object" && action !== null && "type" in action;
}

function advanceTurn(state: HeistState): HeistState {
  return {
    ...state,
    turn: state.turn + 1,
  };
}

function updateAgent(
  state: HeistState,
  agentId: AgentId,
  updates: Partial<HeistAgentState>,
): HeistState {
  const agent = state.agents[agentId];
  return {
    ...state,
    agents: {
      ...state.agents,
      [agentId]: {
        ...agent,
        ...updates,
      },
    },
  };
}

function applyInvalidPenalty(state: HeistState, agentId: AgentId): HeistState {
  const agent = state.agents[agentId];
  const nextAlert = Math.min(state.alertLevel + 1, state.params.rules.maxAlertLevel);
  return {
    ...state,
    alertLevel: nextAlert,
    agents: {
      ...state.agents,
      [agentId]: {
        ...agent,
        score: agent.score - state.params.scoring.invalidActionPenalty,
      },
    },
  };
}

function findDoorBetween(doors: HeistDoor[], roomA: string, roomB: string): HeistDoor | null {
  return (
    doors.find(
      (door) =>
        (door.roomA === roomA && door.roomB === roomB) ||
        (door.roomA === roomB && door.roomB === roomA),
    ) ?? null
  );
}

function isDoorPassable(door: HeistDoor, inventory: Set<string>): boolean {
  if (door.requiredItem && !inventory.has(door.requiredItem)) {
    return false;
  }
  if (door.locked && !door.requiredItem) {
    return false;
  }
  return true;
}

function addUnique(items: string[], itemId: string): string[] {
  if (items.includes(itemId)) {
    return items;
  }
  return [...items, itemId];
}

function hasRequiredObjectives(state: HeistState, agent: HeistAgentState): boolean {
  const inventory = new Set(agent.inventory);
  return state.params.winCondition.requiredObjectives.every((id) => inventory.has(id));
}

function computeScore(state: HeistState, agent: HeistAgentState): number {
  let score = agent.score;
  if (hasRequiredObjectives(state, agent)) {
    score += state.params.scoring.objectiveSecured;
  }
  if (agent.extracted) {
    score += state.params.scoring.extractionBonus;
    const remaining = Math.max(0, state.params.winCondition.maxTurns - state.turn);
    score += remaining * state.params.scoring.turnsRemainingMultiplier;
  }
  score -= state.alertLevel * state.params.scoring.alertPenaltyPerLevel;
  return score;
}
