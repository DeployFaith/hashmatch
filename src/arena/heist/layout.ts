import type { DoorVisual, RoomVisual } from "./types.js";

type RoomPositionHint = { x: number; y: number };

type LayoutResult = Record<string, RoomPositionHint>;

const createAdjacency = (
  rooms: Record<string, RoomVisual>,
  doors: Record<string, DoorVisual>,
): Map<string, string[]> => {
  const roomIds = Object.keys(rooms).sort();
  const adjacency = new Map<string, string[]>();

  for (const roomId of roomIds) {
    adjacency.set(roomId, []);
  }

  for (const door of Object.values(doors)) {
    if (!adjacency.has(door.from) || !adjacency.has(door.to)) {
      continue;
    }
    adjacency.get(door.from)?.push(door.to);
    adjacency.get(door.to)?.push(door.from);
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort();
  }

  return adjacency;
};

const assignLayerPositions = (
  positions: LayoutResult,
  occupied: Set<string>,
  roomIds: string[],
  y: number,
): void => {
  let x = 0;
  for (const roomId of roomIds) {
    while (occupied.has(`${x},${y}`)) {
      x += 1;
    }
    positions[roomId] = { x, y };
    occupied.add(`${x},${y}`);
    x += 1;
  }
};

export const computeRoomLayout = (
  rooms: Record<string, RoomVisual>,
  doors: Record<string, DoorVisual>,
  spawnRoomId?: string,
): LayoutResult => {
  const roomIds = Object.keys(rooms).sort();
  if (roomIds.length === 0) {
    return {};
  }

  const adjacency = createAdjacency(rooms, doors);
  const root = spawnRoomId && adjacency.has(spawnRoomId) ? spawnRoomId : roomIds[0];
  const visited = new Set<string>();
  const layers = new Map<number, string[]>();
  const queue: Array<{ roomId: string; layer: number }> = [];
  let maxLayer = 0;

  visited.add(root);
  layers.set(0, [root]);
  queue.push({ roomId: root, layer: 0 });

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const neighbors = adjacency.get(current.roomId) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue;
      }
      const layer = current.layer + 1;
      visited.add(neighbor);
      maxLayer = Math.max(maxLayer, layer);
      const list = layers.get(layer) ?? [];
      list.push(neighbor);
      layers.set(layer, list);
      queue.push({ roomId: neighbor, layer });
    }
  }

  const positions: LayoutResult = {};
  const occupied = new Set<string>();

  for (let layer = 0; layer <= maxLayer; layer += 1) {
    const roomsInLayer = layers.get(layer);
    if (!roomsInLayer) {
      continue;
    }
    assignLayerPositions(positions, occupied, [...roomsInLayer].sort(), layer);
  }

  const unreachable = roomIds.filter((roomId) => !visited.has(roomId));
  if (unreachable.length > 0) {
    assignLayerPositions(positions, occupied, unreachable.sort(), maxLayer + 1);
  }

  return positions;
};
