import type {
  DoorVisual,
  EntityVisual,
  GuardVisual,
  HeistMapState,
  ItemVisual,
  RoomVisual,
} from "./types.js";
import { computeRoomLayout } from "./layout.js";

type ScenarioParamsLike = {
  extractionRoomId?: unknown;
  map?: {
    rooms?: Array<{ id?: unknown; type?: unknown; position?: { x?: unknown; y?: unknown } }>;
    doors?: Array<{
      id?: unknown;
      roomA?: unknown;
      roomB?: unknown;
      locked?: unknown;
    }>;
  };
  entities?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  winCondition?: {
    extractionRoomId?: unknown;
  };
};

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
  const filtered = value.filter((entry) => typeof entry === "string") as string[];
  return filtered.length > 0 ? filtered : [];
};

const buildRoomVisuals = (params: ScenarioParamsLike): Record<string, RoomVisual> => {
  const rooms = params.map?.rooms ?? [];
  const result: Record<string, RoomVisual> = {};
  for (const room of rooms) {
    const roomId = asString(room.id);
    if (!roomId) {
      continue;
    }
    const position = room.position;
    const positionHint =
      position && asNumber(position.x) !== undefined && asNumber(position.y) !== undefined
        ? { x: position.x as number, y: position.y as number }
        : undefined;
    result[roomId] = {
      roomId,
      label: asString(room.type),
      positionHint,
    };
  }
  return result;
};

const buildDoorVisuals = (params: ScenarioParamsLike): Record<string, DoorVisual> => {
  const doors = params.map?.doors ?? [];
  const result: Record<string, DoorVisual> = {};
  for (const door of doors) {
    const roomA = asString(door.roomA);
    const roomB = asString(door.roomB);
    if (!roomA || !roomB) {
      continue;
    }
    const doorId = asString(door.id) ?? `door:${roomA}:${roomB}`;
    result[doorId] = {
      doorId,
      from: roomA,
      to: roomB,
      isLocked: asBoolean(door.locked),
    };
  }
  return result;
};

const extractState = (value: Record<string, unknown>, omit: string[]): Record<string, unknown> => {
  const state: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!omit.includes(key)) {
      state[key] = entry;
    }
  }
  return state;
};

const buildEntityVisuals = (params: ScenarioParamsLike): {
  guards: Record<string, GuardVisual>;
  entities: Record<string, EntityVisual>;
} => {
  const guards: Record<string, GuardVisual> = {};
  const entities: Record<string, EntityVisual> = {};
  for (const entity of params.entities ?? []) {
    if (!isRecord(entity)) {
      continue;
    }
    const entityId = asString(entity.id);
    const kind = asString(entity.type);
    if (!entityId || !kind) {
      continue;
    }
    if (kind === "guard") {
      const patrolRoomIds = asStringArray(entity.patrolRoute) ?? [];
      guards[entityId] = {
        guardId: entityId,
        patrolRoomIds,
      };
      continue;
    }
    const roomId = asString(entity.roomId);
    const state = extractState(entity, ["id", "type", "roomId", "label"]);
    entities[entityId] = {
      entityId,
      kind,
      roomId,
      label: asString(entity.label),
      state: Object.keys(state).length > 0 ? state : undefined,
    };
  }
  return { guards, entities };
};

const buildItemVisuals = (params: ScenarioParamsLike): Record<string, ItemVisual> => {
  const items: Record<string, ItemVisual> = {};
  for (const item of params.items ?? []) {
    if (!isRecord(item)) {
      continue;
    }
    const itemId = asString(item.id);
    const kind = asString(item.type);
    if (!itemId || !kind) {
      continue;
    }
    const roomId = asString(item.roomId);
    const state = extractState(item, ["id", "type", "roomId", "label"]);
    items[itemId] = {
      itemId,
      kind,
      roomId,
      label: asString(item.label),
      state: Object.keys(state).length > 0 ? state : undefined,
    };
  }
  return items;
};

const findSpawnRoomId = (
  params: ScenarioParamsLike,
  rooms: Record<string, RoomVisual>,
): string | undefined => {
  const spawnRoomIds = Object.values(rooms)
    .filter((room) => room.label === "spawn")
    .map((room) => room.roomId)
    .sort();
  if (spawnRoomIds.length > 0) {
    return spawnRoomIds[0];
  }

  const extractionRoomId =
    asString(params.winCondition?.extractionRoomId) ?? asString(params.extractionRoomId);
  if (extractionRoomId && rooms[extractionRoomId]) {
    return extractionRoomId;
  }

  return undefined;
};

export const initSceneFromScenario = (
  params: ScenarioParamsLike,
): {
  map: HeistMapState;
  guards: Record<string, GuardVisual>;
  entities: Record<string, EntityVisual>;
  items: Record<string, ItemVisual>;
} => {
  const map: HeistMapState = {
    rooms: buildRoomVisuals(params),
    doors: buildDoorVisuals(params),
  };

  const spawnRoomId = findSpawnRoomId(params, map.rooms);
  const layout = computeRoomLayout(map.rooms, map.doors, spawnRoomId);
  const roomsWithLayout: Record<string, RoomVisual> = {};
  for (const room of Object.values(map.rooms)) {
    const positionHint = layout[room.roomId];
    if (!positionHint) {
      throw new Error(`Missing positionHint for room ${room.roomId}`);
    }
    roomsWithLayout[room.roomId] = { ...room, positionHint };
  }

  const { guards, entities } = buildEntityVisuals(params);
  const items = buildItemVisuals(params);

  return { map: { ...map, rooms: roomsWithLayout }, guards, entities, items };
};
