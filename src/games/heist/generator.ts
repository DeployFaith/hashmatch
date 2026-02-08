import { createRng, randomInt } from "../../core/rng.js";
import type { Seed } from "../../contract/types.js";
import type {
  HeistCameraEntity,
  HeistDoor,
  HeistEntity,
  HeistGuardEntity,
  HeistItem,
  HeistKeycardItem,
  HeistLootItem,
  HeistMap,
  HeistRoom,
  HeistRoomType,
  HeistScenarioParams,
  HeistScoring,
  HeistTerminalEntity,
  HeistToolItem,
  HeistVaultEntity,
  HeistWinCondition,
} from "./types.js";
import type { HeistGeneratorConfig } from "./generatorTypes.js";

const DEFAULT_BRANCHING_FACTOR = 2;
const DEFAULT_LOOP_COUNT = 1;
const DEFAULT_LAYOUT_MAX_ATTEMPTS = 10;

type RoomPosition = { x: number; y: number };
type Direction = { x: number; y: number };

const CARDINAL_DIRECTIONS: Direction[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const DEFAULT_RULES = {
  noiseTable: {
    move: 1,
    hack: 2,
    force: 4,
    wait: 0,
  },
  alertThresholds: [0, 3, 6, 10],
  noiseDecayRate: 1,
  guardDetectionRange: 2,
  maxAlertLevel: 3,
  captureOnMaxAlert: true,
};

const DEFAULT_SCORING: HeistScoring = {
  objectiveSecured: 100,
  extractionBonus: 150,
  turnsRemainingMultiplier: 2,
  lootMultiplier: 1,
  alertPenaltyPerLevel: 10,
  invalidActionPenalty: 5,
};

const PRESET_OVERRIDES: Record<string, Partial<HeistScoring>> = {
  easy: { alertPenaltyPerLevel: 5, lootMultiplier: 1.2 },
  normal: {},
  hard: { alertPenaltyPerLevel: 15, lootMultiplier: 0.9 },
};

const DEFAULT_MAX_TURNS = 24;
const DEFAULT_CONFIG: HeistGeneratorConfig = {
  rooms: { exact: 8 },
  securityDensity: {},
  hazardsEnabled: false,
};

type HeistGeneratorConfigInput = Partial<HeistGeneratorConfig> & {
  seed?: Seed;
  preset?: string;
};

export const HEIST_PRESETS: Record<string, HeistGeneratorConfig> = {
  warehouse_breakin: {
    rooms: { min: 7, max: 8 },
    branchingFactor: 2,
    loopCount: 0,
    securityDensity: { guards: 1, cameras: 1, terminals: 1 },
    hazardsEnabled: false,
    maxTurns: 6,
    difficultyPreset: "easy",
    skin: {
      themeName: "Warehouse Break-in",
      flavorText:
        "A corporate whistleblower's evidence is locked in a downtown warehouse vault.",
    },
  },
  prison_escape: {
    rooms: { min: 8, max: 12 },
    branchingFactor: 2,
    loopCount: 0,
    securityDensity: { guards: 2, cameras: 2, terminals: 2 },
    hazardsEnabled: false,
    maxTurns: 6,
    difficultyPreset: "normal",
    skin: {
      themeName: "Prison Escape",
      flavorText: "An underground prison transfer holds the only way out tonight.",
    },
  },
  museum_night: {
    rooms: { min: 10, max: 15 },
    branchingFactor: 2,
    loopCount: 0,
    securityDensity: { guards: 3, cameras: 3, terminals: 3 },
    hazardsEnabled: false,
    maxTurns: 6,
    difficultyPreset: "hard",
    skin: {
      themeName: "Museum Night",
      flavorText: "After hours at the museum, the vault doors are finally unguarded.",
    },
  },
};

interface RoomAssignment {
  rooms: HeistRoom[];
  roomByType: Record<HeistRoomType, string[]>;
}

function resolveRoomCount(config: HeistGeneratorConfig, rng: () => number): number {
  if ("exact" in config.rooms) {
    return Math.max(config.rooms.exact, 3);
  }
  const min = Math.max(config.rooms.min, 3);
  const max = Math.max(config.rooms.max, min);
  return randomInt(rng, min, max);
}

function createRooms(roomCount: number, rng: () => number): RoomAssignment {
  const rooms: HeistRoom[] = [];
  const roomByType: Record<HeistRoomType, string[]> = {
    spawn: [],
    vault: [],
    extraction: [],
    security: [],
    utility: [],
    hallway: [],
    decoy: [],
  };

  const roomTypes: HeistRoomType[] = ["spawn", "vault", "extraction"];
  const extraTypes: HeistRoomType[] = ["security", "utility", "hallway", "decoy"];
  while (roomTypes.length < roomCount) {
    const nextType = extraTypes[randomInt(rng, 0, extraTypes.length - 1)];
    roomTypes.push(nextType);
  }

  for (let i = 0; i < roomTypes.length; i++) {
    const id = `room-${i + 1}`;
    const type = roomTypes[i];
    rooms.push({ id, type });
    roomByType[type].push(id);
  }

  return { rooms, roomByType };
}

function createDoor(id: string, roomA: string, roomB: string, rng: () => number): HeistDoor {
  const locked = rng() < 0.35;
  const alarmed = rng() < 0.25;
  const door: HeistDoor = { id, roomA, roomB };
  if (locked) {
    door.locked = true;
    door.noiseOnForce = randomInt(rng, 1, 4);
  }
  if (alarmed) {
    door.alarmed = true;
  }
  return door;
}

function connectRooms(
  rooms: HeistRoom[],
  rng: () => number,
  branchingFactor: number,
  loopCount: number,
): HeistDoor[] {
  const doors: HeistDoor[] = [];
  let doorIndex = 1;
  const roomIds = rooms.map((room) => room.id);
  const spawnId = rooms.find((room) => room.type === "spawn")?.id ?? roomIds[0];
  const vaultId = rooms.find((room) => room.type === "vault")?.id ?? roomIds[1];
  const extractionId = rooms.find((room) => room.type === "extraction")?.id ?? roomIds[2];

  const pool = roomIds.filter((id) => ![spawnId, vaultId, extractionId].includes(id));
  const ensurePath = (path: string[]) => {
    for (let i = 0; i < path.length - 1; i++) {
      const roomA = path[i];
      const roomB = path[i + 1];
      if (!doors.some((door) => isDoorBetween(door, roomA, roomB))) {
        doors.push(createDoor(`door-${doorIndex++}`, roomA, roomB, rng));
      }
    }
  };

  const firstPath = [spawnId, ...pool.slice(0, Math.min(2, pool.length)), vaultId];
  const secondPath = [spawnId, ...pool.slice(Math.min(2, pool.length), Math.min(4, pool.length)), vaultId];
  ensurePath(firstPath);
  if (branchingFactor > 1 && secondPath.length > 2) {
    ensurePath(secondPath);
  } else if (!doors.some((door) => isDoorBetween(door, spawnId, vaultId))) {
    doors.push(createDoor(`door-${doorIndex++}`, spawnId, vaultId, rng));
  }

  const extractionPath = [vaultId, ...pool.slice(Math.min(4, pool.length), Math.min(5, pool.length)), extractionId];
  ensurePath(extractionPath);

  for (const roomId of roomIds) {
    if (roomId === spawnId || roomId === vaultId || roomId === extractionId) {
      continue;
    }
    const hasConnection = doors.some((door) => door.roomA === roomId || door.roomB === roomId);
    if (!hasConnection) {
      let target = roomIds[randomInt(rng, 0, roomIds.length - 1)];
      if (target === roomId) {
        target = roomIds[(roomIds.indexOf(roomId) + 1) % roomIds.length];
      }
      doors.push(createDoor(`door-${doorIndex++}`, roomId, target, rng));
    }
  }

  const additionalLoops = Math.max(0, loopCount);
  for (let i = 0; i < additionalLoops; i++) {
    const roomA = roomIds[randomInt(rng, 0, roomIds.length - 1)];
    let roomB = roomIds[randomInt(rng, 0, roomIds.length - 1)];
    if (roomA === roomB) {
      roomB = roomIds[(roomIds.indexOf(roomA) + 1) % roomIds.length];
    }
    if (!doors.some((door) => isDoorBetween(door, roomA, roomB))) {
      doors.push(createDoor(`door-${doorIndex++}`, roomA, roomB, rng));
    }
  }

  let reachable = computeReachableRooms(rooms, doors, spawnId);
  while (reachable.size < roomIds.length) {
    const unreachable = roomIds.filter((id) => !reachable.has(id));
    for (const roomId of unreachable) {
      const candidates = roomIds.filter((id) => reachable.has(id));
      if (candidates.length === 0) {
        break;
      }
      let target = candidates[randomInt(rng, 0, candidates.length - 1)];
      if (target === roomId) {
        target = candidates[(candidates.indexOf(target) + 1) % candidates.length];
      }
      if (!doors.some((door) => isDoorBetween(door, roomId, target))) {
        doors.push(createDoor(`door-${doorIndex++}`, roomId, target, rng));
      }
    }
    reachable = computeReachableRooms(rooms, doors, spawnId);
  }

  return doors;
}

function buildUnlockedGraph(
  rooms: HeistRoom[],
  doors: HeistDoor[],
): Map<string, { neighborId: string }[]> {
  const graph = new Map<string, { neighborId: string }[]>();
  for (const room of rooms) {
    graph.set(room.id, []);
  }
  for (const door of doors) {
    if (door.locked) {
      continue;
    }
    graph.get(door.roomA)?.push({ neighborId: door.roomB });
    graph.get(door.roomB)?.push({ neighborId: door.roomA });
  }
  return graph;
}

function buildDoorGraph(
  rooms: HeistRoom[],
  doors: HeistDoor[],
): Map<string, { neighborId: string }[]> {
  const graph = new Map<string, { neighborId: string }[]>();
  for (const room of rooms) {
    graph.set(room.id, []);
  }
  for (const door of doors) {
    graph.get(door.roomA)?.push({ neighborId: door.roomB });
    graph.get(door.roomB)?.push({ neighborId: door.roomA });
  }
  return graph;
}

function buildAdjacencyGraph(
  rooms: HeistRoom[],
  doors: HeistDoor[],
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const room of rooms) {
    graph.set(room.id, []);
  }
  for (const door of doors) {
    graph.get(door.roomA)?.push(door.roomB);
    graph.get(door.roomB)?.push(door.roomA);
  }
  for (const [roomId, neighbors] of graph.entries()) {
    graph.set(roomId, [...neighbors].sort((a, b) => a.localeCompare(b)));
  }
  return graph;
}

function shuffle<T>(values: T[], rng: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function findShortestPathIds(
  graph: Map<string, string[]>,
  startId: string,
  goalId: string,
): string[] | null {
  if (startId === goalId) {
    return [startId];
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
      if (visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      previous.set(neighbor, current);
      if (neighbor === goalId) {
        queue.length = 0;
        break;
      }
      queue.push(neighbor);
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
    path.push(prev);
    cursor = prev;
  }
  path.reverse();
  return path;
}

function buildParentOrder(
  graph: Map<string, string[]>,
  startId: string,
  rng: () => number,
): { order: string[]; parentById: Map<string, string> } {
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  const parentById = new Map<string, string>();
  const order: string[] = [startId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const neighbors = shuffle(graph.get(current) ?? [], rng);
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      parentById.set(neighbor, current);
      order.push(neighbor);
      queue.push(neighbor);
    }
  }

  return { order, parentById };
}

function manhattanDistance(a: RoomPosition, b: RoomPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function computeBoundingBox(
  positions: Iterable<RoomPosition>,
  candidate?: RoomPosition,
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
  }
  if (candidate) {
    minX = Math.min(minX, candidate.x);
    maxX = Math.max(maxX, candidate.x);
    minY = Math.min(minY, candidate.y);
    maxY = Math.max(maxY, candidate.y);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }
  return { minX, maxX, minY, maxY };
}

function computeReachableRooms(
  rooms: HeistRoom[],
  doors: HeistDoor[],
  startId: string,
): Set<string> {
  const graph = buildDoorGraph(rooms, doors);
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
      if (reachable.has(neighbor.neighborId)) {
        continue;
      }
      reachable.add(neighbor.neighborId);
      queue.push(neighbor.neighborId);
    }
  }
  return reachable;
}

function computeUnlockedReachableRooms(
  rooms: HeistRoom[],
  doors: HeistDoor[],
  startId: string,
): string[] {
  const graph = buildUnlockedGraph(rooms, doors);
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
      if (reachable.has(neighbor.neighborId)) {
        continue;
      }
      reachable.add(neighbor.neighborId);
      queue.push(neighbor.neighborId);
    }
  }
  return [...reachable];
}

function isDoorBetween(door: HeistDoor, roomA: string, roomB: string): boolean {
  return (
    (door.roomA === roomA && door.roomB === roomB) ||
    (door.roomA === roomB && door.roomB === roomA)
  );
}

function assignDoorRequirements(doors: HeistDoor[], keycards: HeistKeycardItem[]): void {
  if (keycards.length === 0) {
    return;
  }
  for (let i = 0; i < doors.length; i++) {
    if (!doors[i].locked) {
      continue;
    }
    const keycard = keycards[i % keycards.length];
    doors[i] = {
      ...doors[i],
      requiredItem: keycard.id,
    };
  }
}

function createGuards(
  roomIds: string[],
  rng: () => number,
  count: number,
): HeistGuardEntity[] {
  const guards: HeistGuardEntity[] = [];
  for (let i = 0; i < count; i++) {
    const patrolLength = Math.max(2, randomInt(rng, 2, Math.min(4, roomIds.length)));
    const patrolRoute: string[] = [];
    for (let step = 0; step < patrolLength; step++) {
      patrolRoute.push(roomIds[randomInt(rng, 0, roomIds.length - 1)]);
    }
    guards.push({
      id: `guard-${i + 1}`,
      type: "guard",
      patrolRoute,
      detectionRange: randomInt(rng, 2, 3),
      ...(rng() < 0.5 ? { alertResponse: "lockdown" } : {}),
    });
  }
  return guards;
}

function createCameras(roomIds: string[], rng: () => number, count: number): HeistCameraEntity[] {
  const cameras: HeistCameraEntity[] = [];
  for (let i = 0; i < count; i++) {
    const roomId = roomIds[randomInt(rng, 0, roomIds.length - 1)];
    cameras.push({
      id: `camera-${i + 1}`,
      type: "camera",
      roomId,
      range: randomInt(rng, 2, 4),
      ...(rng() < 0.1 ? { disabled: true } : {}),
    });
  }
  return cameras;
}

function createTerminals(roomIds: string[], rng: () => number, count: number): HeistTerminalEntity[] {
  const terminals: HeistTerminalEntity[] = [];
  for (let i = 0; i < count; i++) {
    const roomId = roomIds[randomInt(rng, 0, roomIds.length - 1)];
    terminals.push({
      id: `terminal-${i + 1}`,
      type: "terminal",
      roomId,
      hackTurns: randomInt(rng, 2, 4),
      ...(rng() < 0.4 ? { alarmOnFail: true } : {}),
    });
  }
  return terminals;
}

function createLoot(roomIds: string[], rng: () => number, count: number): HeistLootItem[] {
  const loot: HeistLootItem[] = [];
  for (let i = 0; i < count; i++) {
    const roomId = roomIds[randomInt(rng, 0, roomIds.length - 1)];
    loot.push({
      id: `loot-${i + 1}`,
      type: "loot",
      roomId,
      scoreValue: randomInt(rng, 20, 60),
    });
  }
  return loot;
}

function createTools(roomIds: string[], rng: () => number, count: number): HeistToolItem[] {
  const toolTypes = ["lockpick", "emp", "drill"];
  const tools: HeistToolItem[] = [];
  for (let i = 0; i < count; i++) {
    const roomId = roomIds[randomInt(rng, 0, roomIds.length - 1)];
    tools.push({
      id: `tool-${i + 1}`,
      type: "tool",
      roomId,
      toolType: toolTypes[randomInt(rng, 0, toolTypes.length - 1)],
      uses: randomInt(rng, 1, 3),
    });
  }
  return tools;
}

function createKeycards(roomIds: string[], rng: () => number, count: number): HeistKeycardItem[] {
  const keycards: HeistKeycardItem[] = [];
  for (let i = 0; i < count; i++) {
    const roomId = roomIds[randomInt(rng, 0, roomIds.length - 1)];
    keycards.push({
      id: `keycard-${i + 1}`,
      type: "keycard",
      roomId,
      level: randomInt(rng, 1, 2),
    });
  }
  return keycards;
}

function createIntelItems(count: number): HeistItem[] {
  const intel: HeistItem[] = [];
  for (let i = 0; i < count; i++) {
    intel.push({
      id: `intel-${i + 1}`,
      type: "intel",
      label: `Fragment ${i + 1}`,
    });
  }
  return intel;
}

function attachTerminalIntel(
  terminals: HeistTerminalEntity[],
  intelItems: HeistItem[],
  rng: () => number,
): void {
  const intelIds = intelItems.map((item) => item.id);
  let cursor = 0;
  for (const terminal of terminals) {
    const grantsCount = Math.max(1, randomInt(rng, 1, Math.min(2, intelIds.length)));
    const grants = intelIds.slice(cursor, cursor + grantsCount);
    cursor = (cursor + grantsCount) % intelIds.length;
    terminal.successGrants = grants;
  }
}

function assignRoomPositions(
  rooms: HeistRoom[],
  doors: HeistDoor[],
  seed: Seed,
  maxAttempts: number,
): HeistRoom[] {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const graph = buildAdjacencyGraph(rooms, doors);
  const spawnId = rooms.find((room) => room.type === "spawn")?.id ?? rooms[0]?.id;
  const vaultId = rooms.find((room) => room.type === "vault")?.id;

  if (!spawnId || !vaultId) {
    throw new Error("Heist layout requires spawn and vault rooms.");
  }

  const spinePath = findShortestPathIds(graph, spawnId, vaultId) ?? [spawnId, vaultId];
  const spineSet = new Set(spinePath);
  const degreeByRoom = new Map(
    [...graph.entries()].map(([roomId, neighbors]) => [roomId, neighbors.length]),
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const layoutRng = createRng(seed + attempt + 1);
    const { order: bfsOrder, parentById } = buildParentOrder(graph, spawnId, layoutRng);
    for (let i = 1; i < spinePath.length; i++) {
      parentById.set(spinePath[i], spinePath[i - 1]);
    }

    const placementOrder = [
      spawnId,
      ...spinePath.filter((id) => id !== spawnId),
      ...bfsOrder.filter((id) => id !== spawnId && !spineSet.has(id)),
    ];

    const positions = new Map<string, RoomPosition>();
    const occupied = new Set<string>();
    positions.set(spawnId, { x: 0, y: 0 });
    occupied.add("0,0");

    let failed = false;

    const pickBestCandidate = (
      room: HeistRoom,
      candidates: { position: RoomPosition; direction: Direction }[],
      parentId: string,
      placedNeighbors: string[],
    ): RoomPosition => {
      const parentPos = positions.get(parentId) ?? { x: 0, y: 0 };
      const grandparentId = parentById.get(parentId);
      const grandparentPos = grandparentId ? positions.get(grandparentId) : undefined;
      const incomingDir = grandparentPos
        ? { x: parentPos.x - grandparentPos.x, y: parentPos.y - grandparentPos.y }
        : undefined;
      const vaultPos = positions.get(vaultId);
      const spawnPos = positions.get(spawnId) ?? { x: 0, y: 0 };

      const scored = candidates.map((candidate) => {
        const { position, direction } = candidate;
        const adjacentCount = placedNeighbors.reduce((count, neighborId) => {
          const neighborPos = positions.get(neighborId);
          if (!neighborPos) {
            return count;
          }
          return count + (manhattanDistance(position, neighborPos) === 1 ? 1 : 0);
        }, 0);
        const bounding = computeBoundingBox(positions.values(), position);
        const onEdge =
          position.x === bounding.minX ||
          position.x === bounding.maxX ||
          position.y === bounding.minY ||
          position.y === bounding.maxY;
        let score = 0;

        score += adjacentCount;

        if (incomingDir) {
          const sameDirection =
            direction.x === incomingDir.x && direction.y === incomingDir.y;
          const perpendicular =
            direction.x === 0 ? incomingDir.x !== 0 : direction.y === 0 && incomingDir.y !== 0;
          if (room.type === "hallway") {
            score += sameDirection ? 3 : perpendicular ? 1 : 0;
          }
          if (room.type === "utility") {
            score += perpendicular ? 2 : 0;
          }
          if (room.type === "decoy") {
            score += perpendicular ? 1 : 0;
          }
          if (spineSet.has(room.id)) {
            score += sameDirection ? 2 : 0;
          }
        }

        if (room.type === "security" && vaultPos) {
          const distance = manhattanDistance(position, vaultPos);
          score += Math.max(0, 3 - distance);
        }

        if (room.type === "vault") {
          score += manhattanDistance(position, spawnPos);
          score += onEdge ? -2 : 2;
        }

        if (room.type === "extraction") {
          if (vaultPos) {
            score += manhattanDistance(position, vaultPos);
          }
          score += onEdge ? 2 : -1;
        }

        if (room.type === "decoy") {
          const parentOnSpine = spineSet.has(parentId);
          const degree = degreeByRoom.get(room.id) ?? 0;
          score += parentOnSpine ? 2 : 0;
          score += degree <= 1 ? 1 : 0;
        }

        return { position, score };
      });

      const maxScore = Math.max(...scored.map((entry) => entry.score));
      const bestCandidates = scored.filter((entry) => entry.score === maxScore);
      return bestCandidates[randomInt(layoutRng, 0, bestCandidates.length - 1)].position;
    };

    for (const roomId of placementOrder) {
      if (roomId === spawnId) {
        continue;
      }
      const room = roomById.get(roomId);
      if (!room) {
        failed = true;
        break;
      }
      const parentId = parentById.get(roomId);
      if (!parentId || !positions.has(parentId)) {
        failed = true;
        break;
      }
      const parentPos = positions.get(parentId);
      if (!parentPos) {
        failed = true;
        break;
      }

      const neighbors = graph.get(roomId) ?? [];
      const placedNeighbors = neighbors.filter((neighborId) => positions.has(neighborId));

      const anchorIds: string[] = [];
      let ancestorId: string | undefined = parentId;
      while (ancestorId) {
        anchorIds.push(ancestorId);
        ancestorId = parentById.get(ancestorId);
      }

      let candidatePool: { position: RoomPosition; direction: Direction }[] = [];
      for (const anchorId of anchorIds) {
        const anchorPos = positions.get(anchorId);
        if (!anchorPos) {
          continue;
        }
        const candidates = CARDINAL_DIRECTIONS.map((direction) => ({
          position: { x: anchorPos.x + direction.x, y: anchorPos.y + direction.y },
          direction,
        })).filter((candidate) => {
          const key = `${candidate.position.x},${candidate.position.y}`;
          if (occupied.has(key)) {
            return false;
          }
          return manhattanDistance(candidate.position, parentPos) === 1;
        });

        if (candidates.length > 0) {
          candidatePool = candidates;
          break;
        }
      }

      if (candidatePool.length === 0) {
        failed = true;
        break;
      }

      const selected = pickBestCandidate(room, candidatePool, parentId, placedNeighbors);
      positions.set(roomId, selected);
      occupied.add(`${selected.x},${selected.y}`);
    }

    if (failed || positions.size !== rooms.length) {
      continue;
    }

    let doorAdjacencyOk = true;
    for (const door of doors) {
      const posA = positions.get(door.roomA);
      const posB = positions.get(door.roomB);
      if (!posA || !posB || manhattanDistance(posA, posB) !== 1) {
        doorAdjacencyOk = false;
        break;
      }
    }
    if (!doorAdjacencyOk) {
      continue;
    }

    return rooms.map((room) => ({
      ...room,
      position: positions.get(room.id) ?? { x: 0, y: 0 },
    }));
  }

  throw new Error("Failed to assign spatial layout within attempt limit.");
}

function createWinCondition(
  extractionRoomId: string,
  requiredObjectives: string[],
  maxTurns: number,
): HeistWinCondition {
  return {
    requiredObjectives,
    extractionRoomId,
    maxTurns,
    maxAlertLevel: DEFAULT_RULES.maxAlertLevel,
  };
}

function buildScenario(config: HeistGeneratorConfig, seed: Seed): HeistScenarioParams {
  const rng = createRng(seed);
  const roomCount = resolveRoomCount(config, rng);
  const branchingFactor = config.branchingFactor ?? DEFAULT_BRANCHING_FACTOR;
  const loopCount = config.loopCount ?? DEFAULT_LOOP_COUNT;
  const { rooms, roomByType } = createRooms(roomCount, rng);
  const doors = connectRooms(rooms, rng, branchingFactor, loopCount);
  const layoutMaxAttempts = config.layoutMaxAttempts ?? DEFAULT_LAYOUT_MAX_ATTEMPTS;
  const roomsWithPositions = assignRoomPositions(rooms, doors, seed, layoutMaxAttempts);

  const spawnId = roomByType.spawn[0];
  const vaultRoomId = roomByType.vault[0];
  const extractionRoomId = roomByType.extraction[0];

  const keycardCount = Math.max(1, Math.floor(roomCount / 4));
  const unlockedReachable = computeUnlockedReachableRooms(rooms, doors, spawnId).filter(
    (id) => id !== vaultRoomId,
  );
  const keycardPlacementRooms =
    unlockedReachable.length > 0
      ? unlockedReachable
      : rooms.map((room) => room.id).filter((id) => id !== vaultRoomId);
  const keycards = createKeycards(keycardPlacementRooms, rng, keycardCount);
  assignDoorRequirements(doors, keycards);

  const tools = createTools(rooms.map((room) => room.id), rng, Math.max(1, Math.floor(roomCount / 3)));
  const loot = createLoot(
    rooms.map((room) => room.id).filter((id) => id !== spawnId),
    rng,
    Math.max(1, Math.floor(roomCount / 2)),
  );

  const intelItems = createIntelItems(Math.max(1, Math.floor(roomCount / 3)));
  const securityDensity = config.securityDensity ?? {};

  const terminals = createTerminals(
    roomByType.security.length > 0 ? roomByType.security : rooms.map((room) => room.id),
    rng,
    securityDensity.terminals ?? Math.max(1, Math.floor(roomCount / 4)),
  );
  attachTerminalIntel(terminals, intelItems, rng);

  const guards = createGuards(
    rooms.map((room) => room.id),
    rng,
    securityDensity.guards ?? Math.max(1, Math.floor(roomCount / 3)),
  );
  const cameras = createCameras(
    roomByType.hallway.length > 0 ? roomByType.hallway : rooms.map((room) => room.id),
    rng,
    securityDensity.cameras ?? Math.max(1, Math.floor(roomCount / 4)),
  );

  const vaultEntity: HeistVaultEntity = {
    id: "vault-1",
    type: "vault",
    roomId: vaultRoomId,
    requiredItems: intelItems.map((item) => item.id),
  };

  const entities: HeistEntity[] = [...guards, ...cameras, ...terminals, vaultEntity];
  const items: HeistItem[] = [...keycards, ...tools, ...loot, ...intelItems];

  const maxTurns = config.maxTurns ?? config.timeLimit ?? DEFAULT_MAX_TURNS;
  const scoring = {
    ...DEFAULT_SCORING,
    ...(config.difficultyPreset ? PRESET_OVERRIDES[config.difficultyPreset] : {}),
  };

  return {
    layoutVersion: 1,
    map: { rooms: roomsWithPositions, doors } satisfies HeistMap,
    entities,
    items,
    rules: DEFAULT_RULES,
    scoring,
    winCondition: createWinCondition(extractionRoomId, intelItems.map((item) => item.id), maxTurns),
    skin: config.skin,
  };
}

export function generateHeistScenario(
  config: HeistGeneratorConfigInput,
  seed?: Seed,
): HeistScenarioParams {
  const { seed: embeddedSeed, preset, ...rawConfig } = config;
  const presetConfig = preset ? HEIST_PRESETS[preset] : undefined;
  const normalizedConfig: HeistGeneratorConfig = {
    ...DEFAULT_CONFIG,
    ...(presetConfig ?? {}),
    ...rawConfig,
    rooms: rawConfig.rooms ?? presetConfig?.rooms ?? DEFAULT_CONFIG.rooms,
    securityDensity: {
      ...DEFAULT_CONFIG.securityDensity,
      ...presetConfig?.securityDensity,
      ...rawConfig.securityDensity,
    },
  };
  const resolvedSeed = seed ?? embeddedSeed ?? 0;
  return buildScenario(normalizedConfig, resolvedSeed);
}
