"use client";

import { Text } from "@react-three/drei";
import type { RoomVisual } from "@/arena/heist/types";

/** Color mapping by room label/type. */
function getRoomColor(label?: string): string {
  switch (label) {
    case "spawn":
      return "#1a3a2a"; // green tint
    case "extraction":
      return "#1a3040"; // cyan tint
    case "vault":
      return "#3a2a10"; // amber tint
    default:
      return "#1e1e2e"; // neutral dark
  }
}

function getRoomBorderColor(label?: string): string {
  switch (label) {
    case "spawn":
      return "#2d6b4a";
    case "extraction":
      return "#2d5a6b";
    case "vault":
      return "#6b5a2d";
    default:
      return "#3a3a4e";
  }
}

const TILE_SIZE = 0.8;

export function RoomTile({
  room,
  dimmed,
  showLabel,
}: {
  room: RoomVisual;
  dimmed: boolean;
  showLabel: boolean;
}) {
  const pos = room.positionHint;
  if (!pos) {
    return null;
  }

  const opacity = dimmed ? 0.25 : 1;
  const fillColor = getRoomColor(room.label);
  const borderColor = getRoomBorderColor(room.label);

  return (
    <group position={[pos.x, pos.y, 0]}>
      {/* Border rectangle (slightly larger) */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[TILE_SIZE + 0.06, TILE_SIZE + 0.06]} />
        <meshBasicMaterial color={borderColor} opacity={opacity} transparent />
      </mesh>
      {/* Fill rectangle */}
      <mesh>
        <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
        <meshBasicMaterial color={fillColor} opacity={opacity} transparent />
      </mesh>
      {/* Label */}
      {showLabel && (
        <Text
          position={[0, TILE_SIZE / 2 + 0.15, 0.01]}
          fontSize={0.1}
          color={dimmed ? "#555566" : "#aaaacc"}
          anchorX="center"
          anchorY="bottom"
          font={undefined}
        >
          {room.label ?? room.roomId}
        </Text>
      )}
    </group>
  );
}
