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
      const target = roomIds[randomInt(rng, 0, roomIds.length - 1)];
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

  return doors;
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

function buildScenario(
  config: HeistGeneratorConfig,
  rng: () => number,
): HeistScenarioParams {
  const roomCount = resolveRoomCount(config, rng);
  const branchingFactor = config.branchingFactor ?? DEFAULT_BRANCHING_FACTOR;
  const loopCount = config.loopCount ?? DEFAULT_LOOP_COUNT;
  const { rooms, roomByType } = createRooms(roomCount, rng);
  const doors = connectRooms(rooms, rng, branchingFactor, loopCount);

  const spawnId = roomByType.spawn[0];
  const vaultRoomId = roomByType.vault[0];
  const extractionRoomId = roomByType.extraction[0];

  const keycardCount = Math.max(1, Math.floor(roomCount / 4));
  const keycards = createKeycards(
    rooms.map((room) => room.id).filter((id) => id !== vaultRoomId),
    rng,
    keycardCount,
  );
  assignDoorRequirements(doors, keycards);

  const tools = createTools(rooms.map((room) => room.id), rng, Math.max(1, Math.floor(roomCount / 3)));
  const loot = createLoot(
    rooms.map((room) => room.id).filter((id) => id !== spawnId),
    rng,
    Math.max(1, Math.floor(roomCount / 2)),
  );

  const intelItems = createIntelItems(Math.max(1, Math.floor(roomCount / 3)));

  const terminals = createTerminals(
    roomByType.security.length > 0 ? roomByType.security : rooms.map((room) => room.id),
    rng,
    Math.max(1, Math.floor(roomCount / 4)),
  );
  attachTerminalIntel(terminals, intelItems, rng);

  const securityDensity = config.securityDensity ?? {};
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
    map: { rooms, doors } satisfies HeistMap,
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
  void preset;
  const normalizedConfig: HeistGeneratorConfig = {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    rooms: rawConfig.rooms ?? DEFAULT_CONFIG.rooms,
    securityDensity: {
      ...DEFAULT_CONFIG.securityDensity,
      ...rawConfig.securityDensity,
    },
  };
  const rng = createRng(seed ?? embeddedSeed ?? 0);
  return buildScenario(normalizedConfig, rng);
}
