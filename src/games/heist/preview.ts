import type {
  HeistDoor,
  HeistEntity,
  HeistItem,
  HeistRoom,
  HeistScenarioParams,
} from "./types.js";

const ROOM_TYPE_LABELS: Record<HeistRoom["type"], string> = {
  spawn: "SPAWN",
  vault: "VAULT",
  extraction: "EXIT",
  security: "SEC",
  utility: "UTIL",
  hallway: "HALL",
  decoy: "DECOY",
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

const pluralize = (label: string, count: number): string =>
  count === 1 ? label : `${label}s`;

const getRoomName = (params: HeistScenarioParams, room: HeistRoom): string =>
  params.skin?.roomDisplayNames?.[room.id] ?? room.id;

const formatRoomLabel = (params: HeistScenarioParams, room: HeistRoom): string => {
  const typeLabel = ROOM_TYPE_LABELS[room.type];
  const name = getRoomName(params, room);
  return `[${typeLabel}: ${name}]`;
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

export function generatePreview(params: HeistScenarioParams): string {
  const lines: string[] = [];
  const roomCount = params.map.rooms.length;
  const doorCount = params.map.doors.length;
  const theme = params.skin?.themeName ?? "Untitled Operation";
  const graph = buildRoomGraph(params.map.rooms, params.map.doors);
  const root = params.map.rooms.find((room) => room.type === "spawn") ?? params.map.rooms[0];
  const treeLike =
    params.map.doors.length === Math.max(0, params.map.rooms.length - 1) &&
    root &&
    isConnected(graph, root.id, roomCount);

  lines.push(`=== HEIST SCENARIO: ${theme} ===`);
  lines.push("");
  lines.push(`MAP (${roomCount} rooms, ${doorCount} doors):`);
  if (roomCount > 0 && doorCount > 0) {
    const mapLines = treeLike
      ? formatTreeMap(params, params.map.rooms, graph)
      : formatAdjacencyMap(params, params.map.rooms, graph);
    lines.push(...mapLines.map((line) => `  ${line}`));
  } else {
    lines.push("  (no map data)");
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
  const extractionName = extractionRoom ? getRoomName(params, extractionRoom) : "the extraction point";
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

  const guardPhrase = guardCount > 0 ? `${guardCount} guard${guardCount === 1 ? "" : "s"}` : "no guards";
  const cameraPhrase =
    cameraCount > 0 ? `${cameraCount} camera${cameraCount === 1 ? "" : "s"}` : "no cameras";

  return [
    `This is a ${difficulty}-difficulty heist scenario with ${roomCount} rooms.`,
    `The agent starts at ${spawnName} and must ${terminalPhrase}${objectivePhrase}, open the vault in ${vaultName}, and escape via ${extractionName} within ${params.winCondition.maxTurns} turns.`,
    `${guardPhrase} patrol the corridors and ${cameraPhrase} monitor key rooms.`,
    describeAlertRules(params),
  ].join(" ");
}
