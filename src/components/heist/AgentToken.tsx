"use client";

import { Text } from "@react-three/drei";
import type { AgentVisual, RoomVisual, RoomId } from "@/arena/heist/types";

/** Per-agent colors cycling through distinct hues. */
const AGENT_COLORS = ["#00e5ff", "#76ff03", "#ff9100", "#e040fb"];

export function AgentToken({
  agent,
  agentIndex,
  rooms,
  agentCount,
}: {
  agent: AgentVisual;
  agentIndex: number;
  rooms: Record<RoomId, RoomVisual>;
  agentCount: number;
}) {
  if (!agent.roomId) {
    return null;
  }

  const room = rooms[agent.roomId];
  if (!room?.positionHint) {
    return null;
  }

  const { x, y } = room.positionHint;
  const color = AGENT_COLORS[agentIndex % AGENT_COLORS.length];

  // Offset agents slightly within the same room so they don't overlap
  const offsetX = agentCount > 1 ? (agentIndex - (agentCount - 1) / 2) * 0.15 : 0;

  return (
    <group position={[x + offsetX, y - 0.15, 0.02]}>
      {/* Diamond shape via rotated square */}
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.14, 0.14]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Agent label */}
      <Text
        position={[0, -0.14, 0.01]}
        fontSize={0.07}
        color={color}
        anchorX="center"
        anchorY="top"
        font={undefined}
      >
        {agent.agentId}
      </Text>
    </group>
  );
}
