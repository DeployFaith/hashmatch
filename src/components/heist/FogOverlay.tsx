"use client";

import type { RoomVisual, RoomId, AgentVisual } from "@/arena/heist/types";

const FOG_TILE_SIZE = 0.86;

/**
 * Compute the set of visible room IDs based on the fog mode.
 *
 * - "spectator": union of all agents' visibleRooms
 * - agent ID string: only that agent's visibleRooms
 *
 * Returns null if everything should be visible (no fog data available).
 */
export function computeVisibleRooms(
  agents: Record<string, AgentVisual>,
  fogMode: string,
): Set<RoomId> | null {
  if (fogMode === "spectator") {
    const union = new Set<RoomId>();
    let hasAny = false;
    for (const agent of Object.values(agents)) {
      if (agent.visibleRooms) {
        hasAny = true;
        for (const rid of agent.visibleRooms) {
          union.add(rid);
        }
      }
    }
    return hasAny ? union : null;
  }

  // Per-agent mode
  const agent = agents[fogMode];
  if (!agent?.visibleRooms) {
    return null;
  }
  return new Set(agent.visibleRooms);
}

/**
 * Renders dark overlay planes on rooms that are NOT in the visible set.
 * If visibleRooms is null, renders nothing (everything visible).
 */
export function FogOverlay({
  rooms,
  visibleRooms,
}: {
  rooms: Record<RoomId, RoomVisual>;
  visibleRooms: Set<RoomId> | null;
}) {
  if (!visibleRooms) {
    return null;
  }

  return (
    <>
      {Object.values(rooms).map((room) => {
        if (!room.positionHint || visibleRooms.has(room.roomId)) {
          return null;
        }
        return (
          <mesh
            key={`fog-${room.roomId}`}
            position={[room.positionHint.x, room.positionHint.y, 0.03]}
          >
            <planeGeometry args={[FOG_TILE_SIZE, FOG_TILE_SIZE]} />
            <meshBasicMaterial color="#000000" opacity={0.6} transparent />
          </mesh>
        );
      })}
    </>
  );
}
