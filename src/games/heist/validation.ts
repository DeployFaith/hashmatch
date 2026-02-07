import type {
  HeistDoor,
  HeistEntity,
  HeistItem,
  HeistScenarioParams,
} from "./types.js";

export type ValidationError = {
  code: string;
  message: string;
  path?: string;
  details?: unknown;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationError[];
};

export const HeistValidationCodes = {
  SchemaInvalid: "HEIST_SCHEMA_INVALID",
  GraphDoorBadEndpoint: "HEIST_GRAPH_DOOR_BAD_ENDPOINT",
  GraphDisconnected: "HEIST_GRAPH_DISCONNECTED",
  PathNoSpawnToVault: "HEIST_PATH_NO_SPAWN_TO_VAULT",
  PathNoVaultToExtraction: "HEIST_PATH_NO_VAULT_TO_EXTRACTION",
  PathTooLong: "HEIST_PATH_TOO_LONG",
  PathTooShort: "HEIST_PATH_TOO_SHORT",
  BranchingInsufficient: "HEIST_BRANCHING_INSUFFICIENT",
  HardlockDetected: "HEIST_HARDLOCK_DETECTED",
} as const;

export type HeistValidationCode = (typeof HeistValidationCodes)[keyof typeof HeistValidationCodes];

export type RoomGraph = Map<string, { neighborId: string; doorId: string }[]>;

export const sortById = <T extends { id: string }>(values: T[]): T[] =>
  [...values].sort((a, b) => a.id.localeCompare(b.id));

export const getRoomIdByType = (
  scenario: HeistScenarioParams,
  type: string,
): string | undefined =>
  sortById(scenario.map.rooms).find((room) => room.type === type)?.id;

export const buildRoomGraph = (rooms: { id: string }[], doors: HeistDoor[]): RoomGraph => {
  const graph: RoomGraph = new Map();
  for (const room of rooms) {
    graph.set(room.id, []);
  }
  for (const door of doors) {
    const roomA = graph.get(door.roomA);
    const roomB = graph.get(door.roomB);
    if (!roomA || !roomB) {
      continue;
    }
    roomA.push({ neighborId: door.roomB, doorId: door.id });
    roomB.push({ neighborId: door.roomA, doorId: door.id });
  }
  for (const [roomId, neighbors] of graph.entries()) {
    graph.set(
      roomId,
      [...neighbors].sort((a, b) => {
        const neighborCompare = a.neighborId.localeCompare(b.neighborId);
        if (neighborCompare !== 0) {
          return neighborCompare;
        }
        return a.doorId.localeCompare(b.doorId);
      }),
    );
  }
  return graph;
};

export const findShortestPath = (
  graph: RoomGraph,
  startId: string,
  goalId: string,
  blockedDoorId?: string,
): { distance: number; path: string[]; doorPath: string[] } | null => {
  if (startId === goalId) {
    return { distance: 0, path: [startId], doorPath: [] };
  }
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  const previous = new Map<string, { prevId: string; doorId: string }>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const neighbors = graph.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (blockedDoorId && neighbor.doorId === blockedDoorId) {
        continue;
      }
      if (visited.has(neighbor.neighborId)) {
        continue;
      }
      visited.add(neighbor.neighborId);
      previous.set(neighbor.neighborId, { prevId: current, doorId: neighbor.doorId });
      if (neighbor.neighborId === goalId) {
        queue.length = 0;
        break;
      }
      queue.push(neighbor.neighborId);
    }
  }

  if (!previous.has(goalId)) {
    return null;
  }

  const path: string[] = [goalId];
  const doorPath: string[] = [];
  let cursor = goalId;
  while (cursor !== startId) {
    const step = previous.get(cursor);
    if (!step) {
      break;
    }
    doorPath.push(step.doorId);
    cursor = step.prevId;
    path.push(cursor);
  }
  path.reverse();
  doorPath.reverse();
  return { distance: path.length - 1, path, doorPath };
};

export const findShortestPathWithInventory = (
  graph: RoomGraph,
  doorsById: Map<string, HeistDoor>,
  inventory: Set<string>,
  startId: string,
  goalId: string,
): { distance: number; path: string[] } | null => {
  if (startId === goalId) {
    return { distance: 0, path: [startId] };
  }
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const neighbors = graph.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.neighborId)) {
        continue;
      }
      const door = doorsById.get(neighbor.doorId);
      if (!door || !isDoorPassable(door, inventory)) {
        continue;
      }
      visited.add(neighbor.neighborId);
      previous.set(neighbor.neighborId, current);
      if (neighbor.neighborId === goalId) {
        queue.length = 0;
        break;
      }
      queue.push(neighbor.neighborId);
    }
  }

  if (!previous.has(goalId)) {
    return null;
  }

  const path: string[] = [goalId];
  let cursor = goalId;
  while (cursor !== startId) {
    const prev = previous.get(cursor);
    if (!prev) {
      break;
    }
    cursor = prev;
    path.push(cursor);
  }
  path.reverse();
  return { distance: path.length - 1, path };
};

const isDoorPassable = (door: HeistDoor, inventory: Set<string>): boolean => {
  if (door.requiredItem && !inventory.has(door.requiredItem)) {
    return false;
  }
  if (door.locked && !door.requiredItem) {
    return false;
  }
  return true;
};

export const computeReachableRooms = (
  graph: RoomGraph,
  startId: string,
  doorsById: Map<string, HeistDoor>,
  inventory: Set<string>,
  blockedDoorId?: string,
): Set<string> => {
  const reachable = new Set<string>();
  const queue: string[] = [startId];
  reachable.add(startId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const neighbors = graph.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (blockedDoorId && neighbor.doorId === blockedDoorId) {
        continue;
      }
      if (reachable.has(neighbor.neighborId)) {
        continue;
      }
      const door = doorsById.get(neighbor.doorId);
      if (!door) {
        continue;
      }
      if (!isDoorPassable(door, inventory)) {
        continue;
      }
      reachable.add(neighbor.neighborId);
      queue.push(neighbor.neighborId);
    }
  }

  return reachable;
};

type InventoryResult = {
  inventory: Set<string>;
  reachableRooms: Set<string>;
};

const collectRoomItems = (
  roomId: string,
  roomItems: Map<string, string[]>,
  inventory: Set<string>,
): boolean => {
  const items = roomItems.get(roomId) ?? [];
  let changed = false;
  for (const itemId of items) {
    if (!inventory.has(itemId)) {
      inventory.add(itemId);
      changed = true;
    }
  }
  return changed;
};

const collectRoomIntel = (
  roomId: string,
  roomIntel: Map<string, string[]>,
  inventory: Set<string>,
): boolean => {
  const intelIds = roomIntel.get(roomId) ?? [];
  let changed = false;
  for (const intelId of intelIds) {
    if (!inventory.has(intelId)) {
      inventory.add(intelId);
      changed = true;
    }
  }
  return changed;
};

const buildRoomItems = (items: HeistItem[]): Map<string, string[]> => {
  const roomItems = new Map<string, string[]>();
  for (const item of items) {
    if (item.type === "intel") {
      continue;
    }
    const list = roomItems.get(item.roomId) ?? [];
    list.push(item.id);
    roomItems.set(item.roomId, list);
  }
  for (const [roomId, list] of roomItems.entries()) {
    roomItems.set(roomId, list.sort((a, b) => a.localeCompare(b)));
  }
  return roomItems;
};

const buildRoomIntel = (entities: HeistEntity[]): Map<string, string[]> => {
  const roomIntel = new Map<string, string[]>();
  for (const entity of entities) {
    if (entity.type !== "terminal") {
      continue;
    }
    const grants = (entity.successGrants ?? []).slice().sort((a, b) => a.localeCompare(b));
    if (grants.length === 0) {
      continue;
    }
    const list = roomIntel.get(entity.roomId) ?? [];
    list.push(...grants);
    roomIntel.set(entity.roomId, list);
  }
  for (const [roomId, list] of roomIntel.entries()) {
    roomIntel.set(roomId, [...new Set(list)].sort((a, b) => a.localeCompare(b)));
  }
  return roomIntel;
};

export const computeInventoryFixpoint = (
  scenario: HeistScenarioParams,
  graph: RoomGraph,
  doorsById: Map<string, HeistDoor>,
  startId: string,
  blockedDoorId?: string,
  initialInventory?: Iterable<string>,
): InventoryResult => {
  const inventory = new Set<string>(initialInventory);
  const roomItems = buildRoomItems(scenario.items);
  const roomIntel = buildRoomIntel(scenario.entities);
  let reachableRooms = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    reachableRooms = computeReachableRooms(graph, startId, doorsById, inventory, blockedDoorId);
    for (const roomId of [...reachableRooms].sort((a, b) => a.localeCompare(b))) {
      if (collectRoomItems(roomId, roomItems, inventory)) {
        changed = true;
      }
      if (collectRoomIntel(roomId, roomIntel, inventory)) {
        changed = true;
      }
    }
  }

  return { inventory, reachableRooms };
};

export const collectDoorValidationErrors = (
  rooms: { id: string }[],
  doors: HeistDoor[],
  itemIds: Set<string>,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const roomIds = new Set(rooms.map((room) => room.id));
  const seenDoorIds = new Set<string>();
  for (const door of doors) {
    if (seenDoorIds.has(door.id)) {
      errors.push({
        code: HeistValidationCodes.GraphDoorBadEndpoint,
        message: `Duplicate door id: ${door.id}`,
        path: "map.doors",
      });
    }
    seenDoorIds.add(door.id);
    if (!roomIds.has(door.roomA) || !roomIds.has(door.roomB)) {
      errors.push({
        code: HeistValidationCodes.GraphDoorBadEndpoint,
        message: `Door ${door.id} references unknown room endpoint.`,
        path: "map.doors",
        details: { doorId: door.id, roomA: door.roomA, roomB: door.roomB },
      });
    }
    if (door.roomA === door.roomB) {
      errors.push({
        code: HeistValidationCodes.GraphDoorBadEndpoint,
        message: `Door ${door.id} must connect two distinct rooms.`,
        path: "map.doors",
        details: { doorId: door.id, roomId: door.roomA },
      });
    }
    if (door.requiredItem && !itemIds.has(door.requiredItem)) {
      errors.push({
        code: HeistValidationCodes.GraphDoorBadEndpoint,
        message: `Door ${door.id} requires unknown item: ${door.requiredItem}.`,
        path: "map.doors",
      });
    }
  }
  return errors;
};
