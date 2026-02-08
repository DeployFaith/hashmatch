import type { HeistDoor, HeistRoom, HeistScenarioParams } from "./types.js";

const ROOM_TYPE_LABELS: Record<string, string> = {
  spawn: "spawn",
  vault: "vault",
  extraction: "extraction",
  security: "security",
  utility: "utility",
  hallway: "hallway",
  hub: "hub",
  decoy: "decoy",
};

const buildRoomGraph = (
  rooms: HeistRoom[],
  doors: HeistDoor[],
): Map<string, { neighborId: string }[]> => {
  const graph = new Map<string, { neighborId: string }[]>();
  for (const room of rooms) {
    graph.set(room.id, []);
  }
  for (const door of doors) {
    graph.get(door.roomA)?.push({ neighborId: door.roomB });
    graph.get(door.roomB)?.push({ neighborId: door.roomA });
  }
  return graph;
};

const hasRoomPositions = (rooms: HeistRoom[]): boolean =>
  rooms.every(
    (room) => room.position && Number.isFinite(room.position.x) && Number.isFinite(room.position.y),
  );

const formatCount = (value: number): string => value.toFixed(2).replace(/\.00$/, "");

const shortestPathDistance = (
  graph: Map<string, { neighborId: string }[]>,
  startId: string,
): Map<string, number> => {
  const distances = new Map<string, number>();
  const queue: string[] = [startId];
  distances.set(startId, 0);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const currentDistance = distances.get(current) ?? 0;
    for (const neighbor of graph.get(current) ?? []) {
      if (!distances.has(neighbor.neighborId)) {
        distances.set(neighbor.neighborId, currentDistance + 1);
        queue.push(neighbor.neighborId);
      }
    }
  }
  return distances;
};

const countComponents = (
  graph: Map<string, { neighborId: string }[]>,
  rooms: HeistRoom[],
): number => {
  const visited = new Set<string>();
  let components = 0;
  for (const room of rooms) {
    if (visited.has(room.id)) {
      continue;
    }
    components += 1;
    const queue = [room.id];
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
  }
  return components;
};

const longestHallwayCorridor = (rooms: HeistRoom[]): number => {
  const hallwayRooms = rooms.filter((room) => room.type === "hallway" && room.position);
  if (hallwayRooms.length === 0) {
    return 0;
  }
  const roomsByPosition = new Map<string, HeistRoom>();
  for (const room of hallwayRooms) {
    if (!room.position) {
      continue;
    }
    roomsByPosition.set(`${room.position.x},${room.position.y}`, room);
  }
  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  let longest = 1;
  for (const room of hallwayRooms) {
    if (!room.position) {
      continue;
    }
    for (const direction of directions) {
      let count = 1;
      let forwardX = room.position.x + direction.x;
      let forwardY = room.position.y + direction.y;
      while (roomsByPosition.has(`${forwardX},${forwardY}`)) {
        count += 1;
        forwardX += direction.x;
        forwardY += direction.y;
      }
      let backwardX = room.position.x - direction.x;
      let backwardY = room.position.y - direction.y;
      while (roomsByPosition.has(`${backwardX},${backwardY}`)) {
        count += 1;
        backwardX -= direction.x;
        backwardY -= direction.y;
      }
      longest = Math.max(longest, count);
    }
  }
  return longest;
};

export function generateLayoutReport(params: HeistScenarioParams): string {
  const rooms = params.map.rooms;
  const doors = params.map.doors;
  const graph = buildRoomGraph(rooms, doors);
  const roomsByType = new Map<string, number>();
  for (const room of rooms) {
    roomsByType.set(room.type, (roomsByType.get(room.type) ?? 0) + 1);
  }
  const typeSummary = Object.entries(ROOM_TYPE_LABELS)
    .map(([type, label]) => `${label}:${roomsByType.get(type) ?? 0}`)
    .join(", ");

  const lines: string[] = [];
  lines.push(`Layout Quality Report: ${params.skin?.themeName ?? "heist"}`);
  lines.push("=".repeat(Math.max(lines[0].length, 32)));
  lines.push(`Rooms: ${rooms.length} (${typeSummary})`);

  if (hasRoomPositions(rooms)) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const room of rooms) {
      if (!room.position) {
        continue;
      }
      minX = Math.min(minX, room.position.x);
      maxX = Math.max(maxX, room.position.x);
      minY = Math.min(minY, room.position.y);
      maxY = Math.max(maxY, room.position.y);
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const aspectRatio = height === 0 ? 0 : width / height;
    lines.push(`Bounding box: ${width}×${height} (aspect ratio: ${formatCount(aspectRatio)})`);

    const manhattanDistances = doors
      .map((door) => {
        const roomA = rooms.find((room) => room.id === door.roomA);
        const roomB = rooms.find((room) => room.id === door.roomB);
        if (!roomA?.position || !roomB?.position) {
          return undefined;
        }
        return (
          Math.abs(roomA.position.x - roomB.position.x) +
          Math.abs(roomA.position.y - roomB.position.y)
        );
      })
      .filter((value): value is number => value !== undefined);
    const avgDoorDistance =
      manhattanDistances.length > 0
        ? manhattanDistances.reduce((sum, value) => sum + value, 0) / manhattanDistances.length
        : 0;
    lines.push(`Door adjacency avg Manhattan distance: ${formatCount(avgDoorDistance)}`);

    const spawnRoom = rooms.find((room) => room.type === "spawn");
    const vaultRoom = rooms.find((room) => room.type === "vault");
    if (spawnRoom?.position && vaultRoom?.position) {
      const manhattan =
        Math.abs(spawnRoom.position.x - vaultRoom.position.x) +
        Math.abs(spawnRoom.position.y - vaultRoom.position.y);
      const distances = shortestPathDistance(graph, spawnRoom.id);
      const graphDistance = distances.get(vaultRoom.id);
      lines.push(`Spawn→Vault Manhattan distance: ${manhattan}`);
      lines.push(
        `Spawn→Vault graph distance: ${graphDistance !== undefined ? graphDistance : "n/a"}`,
      );
    } else {
      lines.push("Spawn→Vault distance: n/a");
    }

    if (vaultRoom) {
      const distances = shortestPathDistance(graph, vaultRoom.id);
      const securityDistances = rooms
        .filter((room) => room.type === "security")
        .map((room) => distances.get(room.id))
        .filter((value): value is number => value !== undefined);
      if (securityDistances.length > 0) {
        const avg =
          securityDistances.reduce((sum, value) => sum + value, 0) / securityDistances.length;
        const maxDistance = Math.max(...securityDistances);
        lines.push(
          `Security→Vault avg distance: ${formatCount(avg)} (max ${formatCount(maxDistance)})`,
        );
      } else {
        lines.push("Security→Vault avg distance: n/a");
      }
    }
  } else {
    lines.push("Bounding box: n/a (missing room positions)");
    lines.push("Door adjacency avg Manhattan distance: n/a");
    lines.push("Spawn→Vault distance: n/a");
    lines.push("Security→Vault avg distance: n/a");
  }

  const deadEnds = rooms.filter((room) => (graph.get(room.id)?.length ?? 0) === 1).length;
  const components = countComponents(graph, rooms);
  const cycles = doors.length - rooms.length + components;
  lines.push(`Dead ends: ${deadEnds}`);
  lines.push(`Loops: ${cycles < 0 ? 0 : cycles}`);
  lines.push(
    `Longest corridor: ${hasRoomPositions(rooms) ? longestHallwayCorridor(rooms) : "n/a"}`,
  );

  return `${lines.join("\n")}\n`;
}
