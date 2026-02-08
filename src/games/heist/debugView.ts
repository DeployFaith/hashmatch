import type { HeistDoor, HeistEntity, HeistItem, HeistRoom, HeistScenarioParams } from "./types.js";

const ROOM_COLORS: Record<string, { fill: string; stroke: string; dashed?: boolean }> = {
  spawn: { fill: "#c8f7c5", stroke: "#2e7d32" },
  vault: { fill: "#ffe082", stroke: "#f57f17" },
  extraction: { fill: "#bbdefb", stroke: "#1565c0" },
  security: { fill: "#ffcdd2", stroke: "#b71c1c" },
  utility: { fill: "#e0e0e0", stroke: "#616161" },
  hallway: { fill: "#f5f5f5", stroke: "#9e9e9e" },
  hub: { fill: "#ffffff", stroke: "#424242" },
  decoy: { fill: "#f5f5f5", stroke: "#616161", dashed: true },
};

const ROOM_LABELS: Record<string, string> = {
  spawn: "Spawn",
  vault: "Vault",
  extraction: "Extraction",
  security: "Security",
  utility: "Utility",
  hallway: "Hallway",
  hub: "Hub",
  decoy: "Decoy",
};

const hasRoomPositions = (rooms: HeistRoom[]): boolean =>
  rooms.every(
    (room) => room.position && Number.isFinite(room.position.x) && Number.isFinite(room.position.y),
  );

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const centerForRoom = (
  room: HeistRoom,
  minX: number,
  maxY: number,
  cellSize: number,
  margin: number,
  roomWidth: number,
  roomHeight: number,
): { x: number; y: number; left: number; top: number } => {
  const xGrid = (room.position?.x ?? 0) - minX;
  const yGrid = maxY - (room.position?.y ?? 0);
  const x = margin + xGrid * cellSize;
  const y = margin + yGrid * cellSize;
  return {
    x: x + roomWidth / 2,
    y: y + roomHeight / 2,
    left: x,
    top: y,
  };
};

const getDoorStroke = (door: HeistDoor): { color: string; dash?: string } => {
  if (door.alarmed) {
    return { color: "#ef6c00", dash: "6,4" };
  }
  if (door.locked) {
    return { color: "#c62828", dash: "8,4" };
  }
  return { color: "#757575" };
};

const getRoomTypeDisplay = (room: HeistRoom): string => ROOM_LABELS[room.type] ?? room.type;

const renderLegend = (originX: number, originY: number): string[] => {
  const lines: string[] = [];
  const entries = [
    { label: "Room (spawn)", fill: ROOM_COLORS.spawn.fill, stroke: ROOM_COLORS.spawn.stroke },
    { label: "Room (vault)", fill: ROOM_COLORS.vault.fill, stroke: ROOM_COLORS.vault.stroke },
    {
      label: "Room (decoy)",
      fill: ROOM_COLORS.decoy.fill,
      stroke: ROOM_COLORS.decoy.stroke,
      dashed: true,
    },
    { label: "Door (unlocked)", stroke: "#757575", line: true },
    { label: "Door (locked)", stroke: "#c62828", line: true, dashed: true },
    { label: "Door (alarmed)", stroke: "#ef6c00", line: true, dashed: true },
    { label: "Guard", marker: "guard" },
    { label: "Camera", marker: "camera" },
    { label: "Terminal", marker: "terminal" },
    { label: "Vault entity", marker: "vault" },
    { label: "Item (keycard)", marker: "keycard" },
    { label: "Item (tool)", marker: "tool" },
    { label: "Item (loot)", marker: "loot" },
    { label: "Item (intel)", marker: "intel" },
  ];
  let offsetY = originY;
  lines.push(
    `<text x="${originX}" y="${offsetY}" font-family="sans-serif" font-size="14" font-weight="bold">Legend</text>`,
  );
  offsetY += 20;
  for (const entry of entries) {
    if (entry.line) {
      lines.push(
        `<line x1="${originX}" y1="${offsetY - 4}" x2="${originX + 24}" y2="${
          offsetY - 4
        }" stroke="${entry.stroke}" stroke-width="3"${
          entry.dashed ? ' stroke-dasharray="6,4"' : ""
        } />`,
      );
    } else if (entry.marker === "guard") {
      lines.push(`<circle cx="${originX + 12}" cy="${offsetY - 6}" r="5" fill="#d32f2f" />`);
    } else if (entry.marker === "camera") {
      lines.push(
        `<polygon points="${originX + 8},${offsetY - 2} ${originX + 16},${offsetY - 10} ${
          originX + 20
        },${offsetY - 2}" fill="#6a1b9a" />`,
      );
    } else if (entry.marker === "terminal") {
      lines.push(
        `<rect x="${originX + 8}" y="${offsetY - 11}" width="10" height="10" fill="#455a64" />`,
      );
    } else if (entry.marker === "vault") {
      lines.push(
        `<circle cx="${originX + 12}" cy="${offsetY - 6}" r="6" fill="none" stroke="#f57f17" stroke-width="2" />`,
      );
    } else if (entry.marker === "keycard") {
      lines.push(`<circle cx="${originX + 12}" cy="${offsetY - 6}" r="4" fill="#7b1fa2" />`);
    } else if (entry.marker === "tool") {
      lines.push(`<circle cx="${originX + 12}" cy="${offsetY - 6}" r="4" fill="#00897b" />`);
    } else if (entry.marker === "loot") {
      lines.push(`<circle cx="${originX + 12}" cy="${offsetY - 6}" r="4" fill="#f9a825" />`);
    } else if (entry.marker === "intel") {
      lines.push(`<circle cx="${originX + 12}" cy="${offsetY - 6}" r="4" fill="#1976d2" />`);
    } else {
      const color = entry.fill ?? "#ffffff";
      const stroke = entry.stroke ?? "#424242";
      lines.push(
        `<rect x="${originX}" y="${offsetY - 14}" width="24" height="14" fill="${color}" stroke="${stroke}"${
          entry.dashed ? ' stroke-dasharray="4,2"' : ""
        } />`,
      );
    }
    lines.push(
      `<text x="${originX + 32}" y="${offsetY - 3}" font-family="sans-serif" font-size="12">${escapeXml(
        entry.label,
      )}</text>`,
    );
    offsetY += 18;
  }
  return lines;
};

const renderGuardPatrol = (
  guard: Extract<HeistEntity, { type: "guard" }>,
  roomsById: Map<string, HeistRoom>,
  minX: number,
  maxY: number,
  cellSize: number,
  margin: number,
  roomWidth: number,
  roomHeight: number,
): string[] => {
  const points: { x: number; y: number }[] = [];
  for (const roomId of guard.patrolRoute) {
    const room = roomsById.get(roomId);
    if (!room?.position) {
      continue;
    }
    const center = centerForRoom(room, minX, maxY, cellSize, margin, roomWidth, roomHeight);
    points.push({ x: center.x, y: center.y });
  }
  if (points.length < 2) {
    return [];
  }
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  return [
    `<polyline points="${path}" fill="none" stroke="#d32f2f" stroke-width="2" stroke-dasharray="4,4" />`,
  ];
};

const groupItemsByRoom = (items: HeistItem[]): Map<string, HeistItem[]> => {
  const map = new Map<string, HeistItem[]>();
  for (const item of items) {
    if (!("roomId" in item)) {
      continue;
    }
    const roomId = item.roomId;
    const existing = map.get(roomId) ?? [];
    existing.push(item);
    map.set(roomId, existing);
  }
  return map;
};

const itemColor = (item: HeistItem): string => {
  switch (item.type) {
    case "keycard":
      return "#7b1fa2";
    case "tool":
      return "#00897b";
    case "loot":
      return "#f9a825";
    case "intel":
      return "#1976d2";
    default:
      return "#424242";
  }
};

export function generateHeistDebugView(params: HeistScenarioParams): string {
  const rooms = params.map.rooms;
  if (!hasRoomPositions(rooms)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="20" y="40" font-family="sans-serif" font-size="16" fill="#d32f2f">No spatial layout data available.</text>
</svg>`;
  }

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

  const cellSize = 120;
  const roomWidth = 80;
  const roomHeight = 60;
  const margin = 60;
  const legendWidth = 260;
  const width = (maxX - minX + 1) * cellSize + margin * 2 + legendWidth;
  const height = (maxY - minY + 1) * cellSize + margin * 2;

  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const lines: string[] = [];

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  lines.push(`<rect width="100%" height="100%" fill="#fafafa" />`);

  for (const door of params.map.doors) {
    const roomA = roomsById.get(door.roomA);
    const roomB = roomsById.get(door.roomB);
    if (!roomA?.position || !roomB?.position) {
      continue;
    }
    const centerA = centerForRoom(roomA, minX, maxY, cellSize, margin, roomWidth, roomHeight);
    const centerB = centerForRoom(roomB, minX, maxY, cellSize, margin, roomWidth, roomHeight);
    const stroke = getDoorStroke(door);
    lines.push(
      `<line x1="${centerA.x}" y1="${centerA.y}" x2="${centerB.x}" y2="${centerB.y}" stroke="${stroke.color}" stroke-width="4"${
        stroke.dash ? ` stroke-dasharray="${stroke.dash}"` : ""
      } />`,
    );
  }

  for (const guard of params.entities.filter((entity) => entity.type === "guard")) {
    lines.push(
      ...renderGuardPatrol(guard, roomsById, minX, maxY, cellSize, margin, roomWidth, roomHeight),
    );
  }

  for (const room of rooms) {
    if (!room.position) {
      continue;
    }
    const colors = ROOM_COLORS[room.type] ?? { fill: "#ffffff", stroke: "#424242" };
    const { left, top } = centerForRoom(room, minX, maxY, cellSize, margin, roomWidth, roomHeight);
    const strokeDash = colors.dashed ? ' stroke-dasharray="6,4"' : "";
    lines.push(
      `<rect x="${left}" y="${top}" width="${roomWidth}" height="${roomHeight}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"${strokeDash} />`,
    );
    lines.push(
      `<text x="${left + roomWidth / 2}" y="${top + roomHeight / 2}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#212121">${escapeXml(
        getRoomTypeDisplay(room),
      )}</text>`,
    );
    lines.push(
      `<text x="${left + roomWidth / 2}" y="${
        top + roomHeight / 2 + 14
      }" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#616161">${escapeXml(
        room.id,
      )}</text>`,
    );
  }

  const itemsByRoom = groupItemsByRoom(params.items);
  for (const [roomId, items] of itemsByRoom) {
    const room = roomsById.get(roomId);
    if (!room?.position) {
      continue;
    }
    const { left, top } = centerForRoom(room, minX, maxY, cellSize, margin, roomWidth, roomHeight);
    const offsetStartX = left + 8;
    const offsetStartY = top + 8;
    const spacing = 10;
    items.forEach((item, index) => {
      const x = offsetStartX + (index % 4) * spacing;
      const y = offsetStartY + Math.floor(index / 4) * spacing;
      lines.push(`<circle cx="${x}" cy="${y}" r="4" fill="${itemColor(item)}" />`);
    });
  }

  for (const entity of params.entities) {
    if (entity.type === "guard") {
      const startRoom = roomsById.get(entity.patrolRoute[0]);
      if (!startRoom?.position) {
        continue;
      }
      const center = centerForRoom(startRoom, minX, maxY, cellSize, margin, roomWidth, roomHeight);
      lines.push(`<circle cx="${center.x}" cy="${center.y}" r="6" fill="#d32f2f" />`);
    } else if (entity.type === "camera") {
      const room = roomsById.get(entity.roomId);
      if (!room?.position) {
        continue;
      }
      const center = centerForRoom(room, minX, maxY, cellSize, margin, roomWidth, roomHeight);
      lines.push(
        `<polygon points="${center.x - 6},${center.y + 6} ${center.x},${center.y - 6} ${center.x + 6},${center.y + 6}" fill="#6a1b9a" />`,
      );
    } else if (entity.type === "terminal") {
      const room = roomsById.get(entity.roomId);
      if (!room?.position) {
        continue;
      }
      const center = centerForRoom(room, minX, maxY, cellSize, margin, roomWidth, roomHeight);
      lines.push(
        `<rect x="${center.x - 5}" y="${center.y - 5}" width="10" height="10" fill="#455a64" />`,
      );
    } else if (entity.type === "vault") {
      const room = roomsById.get(entity.roomId);
      if (!room?.position) {
        continue;
      }
      const center = centerForRoom(room, minX, maxY, cellSize, margin, roomWidth, roomHeight);
      lines.push(
        `<circle cx="${center.x}" cy="${center.y}" r="12" fill="none" stroke="#f57f17" stroke-width="3" />`,
      );
    }
  }

  lines.push(...renderLegend(width - legendWidth + 20, 40));
  lines.push("</svg>");

  return `${lines.join("\n")}\n`;
}
