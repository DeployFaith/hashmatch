import type { HeistDoor, HeistEntity, HeistItem, HeistRoom, HeistScenarioParams } from "./types.js";

const ROOM_TYPE_LABELS: Record<HeistRoom["type"], string> = {
  spawn: "SPAWN",
  vault: "VAULT",
  extraction: "EXIT",
  security: "SEC",
  utility: "UTIL",
  hallway: "HALL",
  decoy: "DECOY",
};

const ROOM_TYPE_SYMBOLS: Record<string, string> = {
  spawn: "S",
  vault: "V",
  extraction: "X",
  security: "!",
  utility: "U",
  hallway: ".",
  hub: "+",
  decoy: "?",
};

const ENTITY_LABELS: Record<HeistEntity["type"], string> = {
  guard: "guard",
  camera: "camera",
  terminal: "terminal",
  vault: "vault",
};

const ITEM_LABELS: Record<HeistItem["type"], string> = {
  keycard: "keycard",
  tool: "tool",
  loot: "loot",
  intel: "intel (virtual)",
};

const pluralize = (label: string, count: number): string => (count === 1 ? label : `${label}s`);

const getRoomName = (params: HeistScenarioParams, room: HeistRoom): string =>
  params.skin?.roomDisplayNames?.[room.id] ?? room.id;

const formatRoomLabel = (params: HeistScenarioParams, room: HeistRoom): string => {
  const typeLabel = ROOM_TYPE_LABELS[room.type];
  const name = getRoomName(params, room);
  return `[${typeLabel}: ${name}]`;
};

const hasRoomPositions = (rooms: HeistRoom[]): boolean =>
  rooms.every(
    (room) => room.position && Number.isFinite(room.position.x) && Number.isFinite(room.position.y),
  );

const formatSpatialMap = (
  rooms: HeistRoom[],
  doors: HeistDoor[],
): { lines: string[]; warnings: string[] } => {
  const roomsByPosition = new Map<string, HeistRoom>();
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const warnings: string[] = [];

  for (const room of rooms) {
    if (!room.position) {
      continue;
    }
    const { x, y } = room.position;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    const key = `${x},${y}`;
    if (roomsByPosition.has(key)) {
      warnings.push(`Duplicate room position at (${x}, ${y}).`);
    }
    roomsByPosition.set(key, room);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { lines: [], warnings };
  }

  const roomCell = (room?: HeistRoom): string => {
    if (!room) {
      return "   ";
    }
    const symbol = ROOM_TYPE_SYMBOLS[room.type] ?? "?";
    return `[${symbol}]`;
  };
  const doorByKey = new Map<string, HeistDoor>();
  for (const door of doors) {
    const key = [door.roomA, door.roomB].sort().join("|");
    doorByKey.set(key, door);
  }
  const getDoor = (roomA?: HeistRoom, roomB?: HeistRoom): HeistDoor | undefined => {
    if (!roomA || !roomB) {
      return undefined;
    }
    const key = [roomA.id, roomB.id].sort().join("|");
    return doorByKey.get(key);
  };
  const horizontalConnector = (door?: HeistDoor): string => {
    if (!door) {
      return "   ";
    }
    if (door.alarmed) {
      return "-*-";
    }
    if (door.locked) {
      return "-#-";
    }
    return "---";
  };
  const verticalConnector = (door?: HeistDoor): string => {
    if (!door) {
      return "   ";
    }
    if (door.alarmed) {
      return " * ";
    }
    if (door.locked) {
      return " # ";
    }
    return " | ";
  };

  const lines: string[] = [];
  for (let y = maxY; y >= minY; y--) {
    const rowCells: string[] = [];
    for (let x = minX; x <= maxX; x++) {
      const current = roomsByPosition.get(`${x},${y}`);
      rowCells.push(roomCell(current));
      if (x < maxX) {
        const next = roomsByPosition.get(`${x + 1},${y}`);
        rowCells.push(horizontalConnector(getDoor(current, next)));
      }
    }
    lines.push(rowCells.join(""));
    if (y > minY) {
      const connectorCells: string[] = [];
      for (let x = minX; x <= maxX; x++) {
        const current = roomsByPosition.get(`${x},${y}`);
        const next = roomsByPosition.get(`${x},${y - 1}`);
        connectorCells.push(verticalConnector(getDoor(current, next)));
        if (x < maxX) {
          connectorCells.push("   ");
        }
      }
      lines.push(connectorCells.join(""));
    }
  }

  return { lines, warnings };
};

const buildRoomGraph = (
  rooms: HeistRoom[],
  doors: HeistDoor[],
): Map<string, { neighborId: string; door: HeistDoor }[]> => {
  const graph = new Map<string, { neighborId: string; door: HeistDoor }[]>();
  for (const room of rooms) {
    graph.set(room.id, []);
  }
  for (const door of doors) {
    graph.get(door.roomA)?.push({ neighborId: door.roomB, door });
    graph.get(door.roomB)?.push({ neighborId: door.roomA, door });
  }
  for (const neighbors of graph.values()) {
    neighbors.sort((a, b) => a.neighborId.localeCompare(b.neighborId));
  }
  return graph;
};

const isConnected = (
  graph: Map<string, { neighborId: string; door: HeistDoor }[]>,
  startId: string,
  roomCount: number,
): boolean => {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const neighbor of graph.get(current) ?? []) {
      if (!visited.has(neighbor.neighborId)) {
        queue.push(neighbor.neighborId);
      }
    }
  }
  return visited.size === roomCount;
};

const doorArrow = (door: HeistDoor): string => (door.locked ? "🔒" : "🔓");

const formatTreeMap = (
  params: HeistScenarioParams,
  rooms: HeistRoom[],
  graph: Map<string, { neighborId: string; door: HeistDoor }[]>,
): string[] => {
  const root = rooms.find((room) => room.type === "spawn") ?? rooms[0];
  if (!root) {
    return [];
  }
  const visited = new Set<string>();
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const lines: string[] = [];

  const walk = (roomId: string, depth: number) => {
    visited.add(roomId);
    for (const neighbor of graph.get(roomId) ?? []) {
      if (visited.has(neighbor.neighborId)) {
        continue;
      }
      const fromRoom = roomById.get(roomId);
      const toRoom = roomById.get(neighbor.neighborId);
      if (!fromRoom || !toRoom) {
        continue;
      }
      const indent = "  ".repeat(depth);
      lines.push(
        `${indent}${formatRoomLabel(params, fromRoom)} --${doorArrow(
          neighbor.door,
        )}--> ${formatRoomLabel(params, toRoom)}`,
      );
      walk(neighbor.neighborId, depth + 1);
    }
  };

  walk(root.id, 0);
  return lines;
};

const formatAdjacencyMap = (
  params: HeistScenarioParams,
  rooms: HeistRoom[],
  graph: Map<string, { neighborId: string; door: HeistDoor }[]>,
): string[] => {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return rooms
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((room) => {
      const neighbors = (graph.get(room.id) ?? []).map((neighbor) => {
        const target = roomById.get(neighbor.neighborId);
        const label = target ? formatRoomLabel(params, target) : neighbor.neighborId;
        return `${doorArrow(neighbor.door)} ${label}`;
      });
      return `  ${formatRoomLabel(params, room)} -> ${neighbors.join(", ")}`;
    });
};

const formatEntitySummary = (entities: HeistEntity[]): string => {
  const counts = new Map<HeistEntity["type"], number>();
  for (const entity of entities) {
    counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
  }
  const parts = Object.entries(ENTITY_LABELS)
    .map(([type, label]) => {
      const count = counts.get(type as HeistEntity["type"]) ?? 0;
      return count > 0 ? `${count} ${pluralize(label, count)}` : null;
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : "none";
};

const formatItemSummary = (params: HeistScenarioParams): string => {
  const counts = new Map<HeistItem["type"], number>();
  for (const item of params.items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  const parts = Object.entries(ITEM_LABELS)
    .map(([type, label]) => {
      const count = counts.get(type as HeistItem["type"]) ?? 0;
      return count > 0 ? `${count} ${pluralize(label, count)}` : null;
    })
    .filter((part): part is string => part !== null);

  const objectiveCount = params.winCondition.requiredObjectives.length;
  if (objectiveCount > 0) {
    parts.push(`${objectiveCount} ${pluralize("objective (virtual)", objectiveCount)}`);
  }

  return parts.length > 0 ? parts.join(", ") : "none";
};

const formatRulesSummary = (params: HeistScenarioParams): string =>
  `${params.winCondition.maxTurns} turns, alert levels 0-${params.rules.maxAlertLevel}, noise decay ${params.rules.noiseDecayRate}/turn`;

const formatScoringSummary = (params: HeistScenarioParams): string =>
  `objective=${params.scoring.objectiveSecured}, extraction=${params.scoring.extractionBonus}, turns×${params.scoring.turnsRemainingMultiplier}, alert×-${params.scoring.alertPenaltyPerLevel}`;

const describeNarrative = (params: HeistScenarioParams): string =>
  params.skin?.flavorText ??
  `A tense infiltration across ${params.map.rooms.length} rooms with ${params.winCondition.requiredObjectives.length} objectives.`;

type PreviewOptions = {
  verbose?: boolean;
};

const formatGuardPatrols = (params: HeistScenarioParams): string[] => {
  const guardEntities = params.entities.filter((entity) => entity.type === "guard");
  if (guardEntities.length === 0) {
    return ["  (no guard patrol routes)"];
  }
  return guardEntities.map((guard) => {
    const route = guard.patrolRoute.map((roomId, index) => `${index + 1}:${roomId}`).join(" -> ");
    return `  ${guard.id}: ${route}`;
  });
};

export function generatePreview(params: HeistScenarioParams, options: PreviewOptions = {}): string {
  const lines: string[] = [];
  const roomCount = params.map.rooms.length;
  const doorCount = params.map.doors.length;
  const theme = params.skin?.themeName ?? "Untitled Operation";
  const graph = buildRoomGraph(params.map.rooms, params.map.doors);
  const root = params.map.rooms.find((room) => room.type === "spawn") ?? params.map.rooms[0];
  const hasSpatialLayout = hasRoomPositions(params.map.rooms);
  const treeLike =
    params.map.doors.length === Math.max(0, params.map.rooms.length - 1) &&
    root &&
    isConnected(graph, root.id, roomCount);

  lines.push(`=== HEIST SCENARIO: ${theme} ===`);
  lines.push("");
  lines.push(`MAP (${roomCount} rooms, ${doorCount} doors):`);
  if (roomCount > 0 && doorCount > 0) {
    const mapLines = hasSpatialLayout
      ? formatSpatialMap(params.map.rooms, params.map.doors)
      : {
          lines: treeLike
            ? formatTreeMap(params, params.map.rooms, graph)
            : formatAdjacencyMap(params, params.map.rooms, graph),
          warnings: ["Room positions missing; falling back to adjacency layout."],
        };
    if (mapLines.warnings.length > 0) {
      for (const warning of mapLines.warnings) {
        lines.push(`  WARNING: ${warning}`);
      }
    }
    lines.push(...mapLines.lines.map((line) => `  ${line}`));
  } else {
    lines.push("  (no map data)");
  }
  if (roomCount > 0) {
    const roomIds = params.map.rooms.map((room) => room.id).join(", ");
    lines.push(`ROOM IDS: ${roomIds}`);
  }
  if (options.verbose) {
    lines.push("");
    lines.push("GUARD PATROLS:");
    lines.push(...formatGuardPatrols(params));
  }
  lines.push("");
  lines.push(`ENTITIES: ${formatEntitySummary(params.entities)}`);
  lines.push(`ITEMS: ${formatItemSummary(params)}`);
  lines.push(`RULES: ${formatRulesSummary(params)}`);
  lines.push(`SCORING: ${formatScoringSummary(params)}`);
  lines.push("");
  lines.push(`NARRATIVE: ${describeNarrative(params)}`);

  return `${lines.join("\n")}\n`;
}

const getDifficultyLabel = (params: HeistScenarioParams): string => {
  const roomCount = params.map.rooms.length;
  const guardCount = params.entities.filter((entity) => entity.type === "guard").length;
  const cameraCount = params.entities.filter((entity) => entity.type === "camera").length;
  if (roomCount <= 8 && guardCount <= 1 && cameraCount <= 1) {
    return "easy";
  }
  if (roomCount >= 12 || guardCount >= 3 || cameraCount >= 3) {
    return "hard";
  }
  return "medium";
};

const describeAlertRules = (params: HeistScenarioParams): string => {
  const thresholds = params.rules.alertThresholds.join("/");
  if (params.rules.captureOnMaxAlert) {
    return `Alert thresholds at ${thresholds}; capture at level ${params.rules.maxAlertLevel}.`;
  }
  return `Alert thresholds at ${thresholds}; max level ${params.rules.maxAlertLevel}.`;
};

export function generateDescription(params: HeistScenarioParams): string {
  const difficulty = getDifficultyLabel(params);
  const roomCount = params.map.rooms.length;
  const roomsByType = new Map(params.map.rooms.map((room) => [room.type, room]));
  const spawnRoom = roomsByType.get("spawn");
  const vaultRoom = roomsByType.get("vault");
  const extractionRoom = params.map.rooms.find(
    (room) => room.id === params.winCondition.extractionRoomId,
  );
  const spawnName = spawnRoom ? getRoomName(params, spawnRoom) : "the entry point";
  const vaultName = vaultRoom ? getRoomName(params, vaultRoom) : "the vault";
  const extractionName = extractionRoom
    ? getRoomName(params, extractionRoom)
    : "the extraction point";
  const terminalCount = params.entities.filter((entity) => entity.type === "terminal").length;
  const guardCount = params.entities.filter((entity) => entity.type === "guard").length;
  const cameraCount = params.entities.filter((entity) => entity.type === "camera").length;
  const objectiveCount = params.winCondition.requiredObjectives.length;

  const objectivePhrase =
    objectiveCount > 0
      ? `secure ${objectiveCount} objective${objectiveCount === 1 ? "" : "s"}`
      : "secure the objectives";
  const terminalPhrase =
    terminalCount > 0
      ? `Hack ${terminalCount} terminal${terminalCount === 1 ? "" : "s"} to obtain intel, then `
      : "";

  const guardPhrase =
    guardCount > 0 ? `${guardCount} guard${guardCount === 1 ? "" : "s"}` : "no guards";
  const cameraPhrase =
    cameraCount > 0 ? `${cameraCount} camera${cameraCount === 1 ? "" : "s"}` : "no cameras";

  return [
    `This is a ${difficulty}-difficulty heist scenario with ${roomCount} rooms.`,
    `The agent starts at ${spawnName} and must ${terminalPhrase}${objectivePhrase}, open the vault in ${vaultName}, and escape via ${extractionName} within ${params.winCondition.maxTurns} turns.`,
    `${guardPhrase} patrol the corridors and ${cameraPhrase} monitor key rooms.`,
    describeAlertRules(params),
  ].join(" ");
}
