"use client";

import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import type { GuardVisual, RoomVisual, RoomId } from "@/arena/heist/types";

const GUARD_COLOR = "#ff5252";
const PATROL_COLOR = "#ff525240";

export function GuardToken({
  guard,
  rooms,
  showPatrol,
}: {
  guard: GuardVisual;
  rooms: Record<RoomId, RoomVisual>;
  showPatrol: boolean;
}) {
  // Patrol route polyline points
  const patrolPoints = useMemo(() => {
    if (!showPatrol || guard.patrolRoomIds.length < 2) {
      return null;
    }
    const pts: [number, number, number][] = [];
    for (const rid of guard.patrolRoomIds) {
      const room = rooms[rid];
      if (room?.positionHint) {
        pts.push([room.positionHint.x, room.positionHint.y, 0.005]);
      }
    }
    return pts.length >= 2 ? pts : null;
  }, [guard.patrolRoomIds, rooms, showPatrol]);

  if (!guard.roomId) {
    return null;
  }

  const room = rooms[guard.roomId];
  if (!room?.positionHint) {
    return null;
  }

  const { x, y } = room.positionHint;

  // Triangle vertices (equilateral, pointing up)
  const r = 0.08;
  const triVerts = useMemo(
    () =>
      new Float32Array([
        0,
        r,
        0, // top
        -r * 0.866,
        -r * 0.5,
        0, // bottom-left
        r * 0.866,
        -r * 0.5,
        0, // bottom-right
      ]),
    [r],
  );

  const triIndices = useMemo(() => new Uint16Array([0, 1, 2]), []);

  return (
    <>
      {/* Patrol route line */}
      {patrolPoints && (
        <Line
          points={patrolPoints}
          color={PATROL_COLOR}
          lineWidth={1.5}
          dashed
          dashSize={0.08}
          gapSize={0.06}
        />
      )}

      {/* Guard marker */}
      <group position={[x + 0.2, y + 0.15, 0.02]}>
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[triVerts, 3]} />
            <bufferAttribute attach="index" args={[triIndices, 1]} />
          </bufferGeometry>
          <meshBasicMaterial color={GUARD_COLOR} />
        </mesh>
        <Text
          position={[0, -0.12, 0.01]}
          fontSize={0.06}
          color={GUARD_COLOR}
          anchorX="center"
          anchorY="top"
          font={undefined}
        >
          {guard.guardId}
        </Text>
      </group>
    </>
  );
}
