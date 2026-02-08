import { z } from "zod";
import {
  HeistScenarioParamsSchema,
  type HeistDoor,
  type HeistScenarioParams,
  type HeistScenarioParamsSchemaType,
} from "./types.js";
import {
  HeistValidationCodes,
  buildRoomGraph,
  collectDoorValidationErrors,
  computeInventoryFixpoint,
  findShortestPath,
  findShortestPathWithInventory,
  getRoomIdByType,
  sortById,
  type ValidationError,
  type ValidationResult,
} from "./validation.js";

type HeistScenarioInput = HeistScenarioParams | HeistScenarioParamsSchemaType;
type HeistLayoutValidationOptions = {
  aspectRatioLimit?: number;
};

const DEFAULT_LAYOUT_ASPECT_RATIO_LIMIT = 4;

const mapSchemaIssueCode = (issue: z.ZodIssue): string => {
  if (issue.message.startsWith("Door ") && issue.message.includes("references unknown room")) {
    return HeistValidationCodes.GraphDoorBadEndpoint;
  }
  if (issue.message.startsWith("Door ") && issue.message.includes("requires unknown item")) {
    return HeistValidationCodes.GraphDoorBadEndpoint;
  }
  if (issue.message.startsWith("Duplicate door id")) {
    return HeistValidationCodes.GraphDoorBadEndpoint;
  }
  return HeistValidationCodes.SchemaInvalid;
};

const formatZodIssue = (issue: z.ZodIssue): ValidationError => ({
  code: mapSchemaIssueCode(issue),
  message: issue.message,
  path: issue.path.length > 0 ? issue.path.join(".") : undefined,
});

const uniqueRoomIds = (scenario: HeistScenarioParams): string[] =>
  [...new Set(scenario.map.rooms.map((room) => room.id))].sort((a, b) => a.localeCompare(b));

const buildDoorsById = (doors: HeistDoor[]): Map<string, HeistDoor> => {
  const map = new Map<string, HeistDoor>();
  for (const door of sortById(doors)) {
    map.set(door.id, door);
  }
  return map;
};

const ensureBranching = (
  graph: Map<string, { neighborId: string; doorId: string }[]>,
  spawnId: string,
  vaultId: string,
): boolean => {
  const shortest = findShortestPath(graph, spawnId, vaultId);
  if (!shortest || shortest.doorPath.length === 0) {
    return false;
  }
  for (const doorId of shortest.doorPath) {
    const alternate = findShortestPath(graph, spawnId, vaultId, doorId);
    if (alternate) {
      return true;
    }
  }
  return false;
};

const addObjectiveItems = (
  inventory: Set<string>,
  objectiveIds: string[],
  vaultRequirements: string[],
): boolean => {
  if (!vaultRequirements.every((itemId) => inventory.has(itemId))) {
    return false;
  }
  let changed = false;
  for (const objectiveId of objectiveIds) {
    if (!inventory.has(objectiveId)) {
      inventory.add(objectiveId);
      changed = true;
    }
  }
  return changed;
};

const gatherVaultRequirements = (scenario: HeistScenarioParams): string[] => {
  const requirements = new Set<string>();
  for (const entity of scenario.entities) {
    if (entity.type === "vault") {
      for (const itemId of entity.requiredItems) {
        requirements.add(itemId);
      }
    }
  }
  return [...requirements].sort((a, b) => a.localeCompare(b));
};

const computeInventoryWithObjectives = (
  scenario: HeistScenarioParams,
  graph: Map<string, { neighborId: string; doorId: string }[]>,
  doorsById: Map<string, HeistDoor>,
  spawnId: string,
  vaultId: string,
  blockedDoorId?: string,
): { inventory: Set<string>; reachableRooms: Set<string> } => {
  const objectiveIds = [...scenario.winCondition.requiredObjectives].sort((a, b) =>
    a.localeCompare(b),
  );
  const vaultRequirements = gatherVaultRequirements(scenario);
  const baseResult = computeInventoryFixpoint(scenario, graph, doorsById, spawnId, blockedDoorId);
  if (!baseResult.reachableRooms.has(vaultId)) {
    return baseResult;
  }
  const inventory = new Set(baseResult.inventory);
  const updated = addObjectiveItems(inventory, objectiveIds, vaultRequirements);
  if (!updated) {
    return baseResult;
  }
  const finalResult = computeInventoryFixpoint(
    scenario,
    graph,
    doorsById,
    spawnId,
    blockedDoorId,
    inventory,
  );
  return { inventory: finalResult.inventory, reachableRooms: finalResult.reachableRooms };
};

const shortestPathLength = (
  graph: Map<string, { neighborId: string; doorId: string }[]>,
  doorsById: Map<string, HeistDoor>,
  inventory: Set<string>,
  startId: string,
  goalId: string,
): number | null => {
  const result = findShortestPathWithInventory(graph, doorsById, inventory, startId, goalId);
  return result?.distance ?? null;
};

const computeReachableRoomsIgnoringLocks = (
  graph: Map<string, { neighborId: string; doorId: string }[]>,
  startId: string,
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
      if (reachable.has(neighbor.neighborId)) {
        continue;
      }
      reachable.add(neighbor.neighborId);
      queue.push(neighbor.neighborId);
    }
  }
  return reachable;
};

export const validateHeistScenario = (
  scenario: HeistScenarioInput,
  options: HeistLayoutValidationOptions = {},
): ValidationResult => {
  const result = HeistScenarioParamsSchema.safeParse(scenario);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(formatZodIssue),
    };
  }

  const params = result.data;
  const errors: ValidationError[] = [];
  const roomIds = uniqueRoomIds(params);
  const itemIds = new Set(params.items.map((item) => item.id));
  const doorsById = buildDoorsById(params.map.doors);

  errors.push(...collectDoorValidationErrors(params.map.rooms, params.map.doors, itemIds));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const graph = buildRoomGraph(params.map.rooms, params.map.doors);
  const spawnId = getRoomIdByType(params, "spawn");
  const vaultId = getRoomIdByType(params, "vault");
  const extractionId = params.winCondition.extractionRoomId;

  if (!spawnId || !vaultId || !extractionId) {
    errors.push({
      code: HeistValidationCodes.GraphDisconnected,
      message: "Scenario must include spawn, vault, and extraction rooms.",
      path: "map.rooms",
    });
    return { ok: false, errors };
  }

  const reachableFromSpawn = computeReachableRoomsIgnoringLocks(graph, spawnId);
  for (const roomId of roomIds) {
    if (!reachableFromSpawn.has(roomId)) {
      errors.push({
        code: HeistValidationCodes.GraphDisconnected,
        message: `Room ${roomId} is not connected to spawn.`,
        path: "map.doors",
        details: { roomId },
      });
    }
  }

  const inventoryResult = computeInventoryWithObjectives(
    params,
    graph,
    doorsById,
    spawnId,
    vaultId,
  );

  if (!inventoryResult.reachableRooms.has(vaultId)) {
    errors.push({
      code: HeistValidationCodes.PathNoSpawnToVault,
      message: "Vault is not reachable from spawn with available items.",
      path: "map.doors",
    });
  }

  const extractionReachable = inventoryResult.reachableRooms.has(extractionId);
  if (!extractionReachable) {
    errors.push({
      code: HeistValidationCodes.PathNoVaultToExtraction,
      message: "Extraction is not reachable after securing objectives.",
      path: "winCondition.extractionRoomId",
    });
  }

  const maxTurns = params.winCondition.maxTurns;
  const shortestSpawnToVault = shortestPathLength(
    graph,
    doorsById,
    inventoryResult.inventory,
    spawnId,
    vaultId,
  );
  if (shortestSpawnToVault === null) {
    errors.push({
      code: HeistValidationCodes.PathNoSpawnToVault,
      message: "No path from spawn to vault is available with current inventory.",
      path: "map.doors",
    });
  } else if (shortestSpawnToVault >= maxTurns) {
    errors.push({
      code: HeistValidationCodes.PathTooLong,
      message: `Shortest path from spawn to vault exceeds max turns (${shortestSpawnToVault} >= ${maxTurns}).`,
      path: "winCondition.maxTurns",
      details: { shortestSpawnToVault, maxTurns },
    });
  }
  const trivialThreshold = Math.ceil(maxTurns * 0.3);
  if (shortestSpawnToVault !== null && shortestSpawnToVault <= trivialThreshold) {
    errors.push({
      code: HeistValidationCodes.PathTooShort,
      message: `Shortest path from spawn to vault is too short (${shortestSpawnToVault} <= ${trivialThreshold}).`,
      path: "winCondition.maxTurns",
      details: { shortestSpawnToVault, maxTurns, trivialThreshold },
    });
  }

  const shortestVaultToExtraction = shortestPathLength(
    graph,
    doorsById,
    inventoryResult.inventory,
    vaultId,
    extractionId,
  );
  if (shortestVaultToExtraction === null) {
    errors.push({
      code: HeistValidationCodes.PathNoVaultToExtraction,
      message: "No viable path from vault to extraction is available.",
      path: "winCondition.extractionRoomId",
    });
  }

  if (!ensureBranching(graph, spawnId, vaultId)) {
    errors.push({
      code: HeistValidationCodes.BranchingInsufficient,
      message: "Scenario must provide at least two distinct paths from spawn to vault.",
      path: "map.doors",
    });
  }

  for (const door of sortById(params.map.doors)) {
    if (!door.requiredItem) {
      continue;
    }
    const { inventory: inventoryWithObjectives, reachableRooms } = computeInventoryWithObjectives(
      params,
      graph,
      doorsById,
      spawnId,
      vaultId,
      door.id,
    );
    const canReachVault = reachableRooms.has(vaultId);
    const hasItem = inventoryWithObjectives.has(door.requiredItem);
    if (!hasItem || !canReachVault) {
      errors.push({
        code: HeistValidationCodes.HardlockDetected,
        message: `Required item ${door.requiredItem} is locked behind door ${door.id}.`,
        path: "map.doors",
        details: { doorId: door.id, requiredItem: door.requiredItem },
      });
    }
  }

  const roomsWithPositions = params.map.rooms.filter((room) => room.position);
  const hasLayoutPositions = roomsWithPositions.length === params.map.rooms.length;
  if (hasLayoutPositions) {
    const positionsById = new Map(
      roomsWithPositions.map((room) => [room.id, room.position ?? { x: 0, y: 0 }]),
    );
    const occupied = new Map<string, string>();

    for (const room of roomsWithPositions) {
      const position = room.position ?? { x: 0, y: 0 };
      const key = `${position.x},${position.y}`;
      const existing = occupied.get(key);
      if (existing) {
        errors.push({
          code: HeistValidationCodes.LayoutOverlap,
          message: `Rooms ${existing} and ${room.id} overlap at (${position.x}, ${position.y}).`,
          path: "map.rooms",
          details: { roomA: existing, roomB: room.id, position },
        });
      } else {
        occupied.set(key, room.id);
      }
    }

    for (const door of params.map.doors) {
      const roomAPos = positionsById.get(door.roomA);
      const roomBPos = positionsById.get(door.roomB);
      if (!roomAPos || !roomBPos) {
        continue;
      }
      const distance = Math.abs(roomAPos.x - roomBPos.x) + Math.abs(roomAPos.y - roomBPos.y);
      if (distance !== 1) {
        errors.push({
          code: HeistValidationCodes.LayoutDoorNotAdjacent,
          message: `Door ${door.id} connects non-adjacent rooms ${door.roomA} and ${door.roomB}.`,
          path: "map.doors",
          details: {
            doorId: door.id,
            roomA: door.roomA,
            roomB: door.roomB,
            positionA: roomAPos,
            positionB: roomBPos,
          },
        });
      }
    }

    if (roomsWithPositions.length > 0) {
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const room of roomsWithPositions) {
        const pos = room.position ?? { x: 0, y: 0 };
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
      }
      const width = Math.max(1, maxX - minX + 1);
      const height = Math.max(1, maxY - minY + 1);
      const ratio = Math.max(width, height) / Math.min(width, height);
      const aspectRatioLimit = options.aspectRatioLimit ?? DEFAULT_LAYOUT_ASPECT_RATIO_LIMIT;
      if (ratio > aspectRatioLimit) {
        errors.push({
          code: HeistValidationCodes.LayoutAspectRatio,
          message: `Layout aspect ratio ${ratio.toFixed(2)} exceeds limit of ${aspectRatioLimit}.`,
          path: "map.rooms",
          details: { width, height, ratio, aspectRatioLimit },
        });
      }
    }

    const visited = new Set<string>();
    const queue: string[] = [];
    const [firstRoom] = roomsWithPositions;
    if (firstRoom) {
      visited.add(firstRoom.id);
      queue.push(firstRoom.id);
    }
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }
      for (const door of params.map.doors) {
        const neighborId =
          door.roomA === current ? door.roomB : door.roomB === current ? door.roomA : undefined;
        if (!neighborId || visited.has(neighborId)) {
          continue;
        }
        const currentPos = positionsById.get(current);
        const neighborPos = positionsById.get(neighborId);
        if (!currentPos || !neighborPos) {
          continue;
        }
        const distance =
          Math.abs(currentPos.x - neighborPos.x) + Math.abs(currentPos.y - neighborPos.y);
        if (distance !== 1) {
          continue;
        }
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
    if (visited.size !== roomsWithPositions.length) {
      errors.push({
        code: HeistValidationCodes.LayoutDisconnected,
        message: "Layout positions are not connected via adjacent doors.",
        path: "map.rooms",
        details: { visited: visited.size, total: roomsWithPositions.length },
      });
    }
  }

  if (errors.length === 0) {
    return { ok: true, errors: [] };
  }
  return { ok: false, errors };
};
