"use client";

import { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { MapControls, Line, Text } from "@react-three/drei";
import type { HeistSceneState, DoorVisual, RoomId, RoomVisual } from "@/arena/heist/types";
import { RoomTile } from "./RoomTile";
import { AgentToken } from "./AgentToken";
import { GuardToken } from "./GuardToken";
import { FogOverlay, computeVisibleRooms } from "./FogOverlay";
import { ViewportControls, DEFAULT_SETTINGS } from "./ViewportControls";
import type { ViewportSettings } from "./ViewportControls";

// ---------------------------------------------------------------------------
// Door rendering helpers
// ---------------------------------------------------------------------------

/** De-duplicate door edges: for doors A->B and B->A, only render one line. */
function deduplicateDoors(doors: Record<string, DoorVisual>): DoorVisual[] {
  const seen = new Set<string>();
  const result: DoorVisual[] = [];
  for (const door of Object.values(doors)) {
    const key = [door.from, door.to].sort().join("::");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(door);
  }
  return result;
}

function DoorLine({
  door,
  rooms,
  showLabel,
}: {
  door: DoorVisual;
  rooms: Record<RoomId, RoomVisual>;
  showLabel: boolean;
}) {
  const fromRoom = rooms[door.from];
  const toRoom = rooms[door.to];
  if (!fromRoom?.positionHint || !toRoom?.positionHint) {
    return null;
  }

  const from: [number, number, number] = [fromRoom.positionHint.x, fromRoom.positionHint.y, 0.005];
  const to: [number, number, number] = [toRoom.positionHint.x, toRoom.positionHint.y, 0.005];
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2;

  const isLocked = door.isLocked === true;
  const color = isLocked ? "#ff5252" : "#3a3a5e";

  return (
    <>
      <Line
        points={[from, to]}
        color={color}
        lineWidth={isLocked ? 1.5 : 1}
        dashed={isLocked}
        dashSize={0.06}
        gapSize={0.04}
      />
      {showLabel && (
        <Text
          position={[midX, midY, 0.01]}
          fontSize={0.06}
          color="#666688"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {door.doorId}
        </Text>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Camera bounds computation — stable, only depends on room positions.
// ---------------------------------------------------------------------------

function computeCameraBounds(rooms: Record<RoomId, RoomVisual>): {
  centerX: number;
  centerY: number;
  zoom: number;
} {
  const positions = Object.values(rooms)
    .map((r) => r.positionHint)
    .filter(Boolean) as Array<{ x: number; y: number }>;

  if (positions.length === 0) {
    return { centerX: 0, centerY: 0, zoom: 100 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of positions) {
    if (p.x < minX) {
      minX = p.x;
    }
    if (p.x > maxX) {
      maxX = p.x;
    }
    if (p.y < minY) {
      minY = p.y;
    }
    if (p.y > maxY) {
      maxY = p.y;
    }
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const spanX = maxX - minX + 2; // padding
  const spanY = maxY - minY + 2;
  const span = Math.max(spanX, spanY, 2);
  // Compute zoom so the scene fits within a ~500px viewport dimension
  const zoom = Math.min(400 / span, 200);

  return { centerX, centerY, zoom };
}

// ---------------------------------------------------------------------------
// Scene content (rendered inside the Canvas)
// ---------------------------------------------------------------------------

function HeistScene({ scene, settings }: { scene: HeistSceneState; settings: ViewportSettings }) {
  const { rooms, doors } = scene.map;
  const dedupedDoors = useMemo(() => deduplicateDoors(doors), [doors]);

  const visibleRooms = useMemo(
    () => computeVisibleRooms(scene.agents, settings.fogMode),
    [scene.agents, settings.fogMode],
  );

  const sortedAgentIds = useMemo(() => Object.keys(scene.agents).sort(), [scene.agents]);

  return (
    <>
      {/* Room tiles */}
      {Object.values(rooms).map((room) => {
        if (!room.positionHint) {
          if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.warn(`[HeistViewport] Missing positionHint for room ${room.roomId}`);
          }
          return null;
        }
        const dimmed = visibleRooms !== null && !visibleRooms.has(room.roomId);
        return (
          <RoomTile
            key={room.roomId}
            room={room}
            dimmed={dimmed}
            showLabel={settings.showRoomLabels}
          />
        );
      })}

      {/* Door lines */}
      {dedupedDoors.map((door) => (
        <DoorLine key={door.doorId} door={door} rooms={rooms} showLabel={settings.showDoorLabels} />
      ))}

      {/* Fog overlay */}
      <FogOverlay rooms={rooms} visibleRooms={visibleRooms} />

      {/* Agent tokens */}
      {sortedAgentIds.map((id, idx) => {
        const agent = scene.agents[id];
        if (!agent) {
          return null;
        }
        return (
          <AgentToken
            key={id}
            agent={agent}
            agentIndex={idx}
            rooms={rooms}
            agentCount={sortedAgentIds.length}
          />
        );
      })}

      {/* Guard tokens */}
      {Object.values(scene.guards).map((guard) => (
        <GuardToken
          key={guard.guardId}
          guard={guard}
          rooms={rooms}
          showPatrol={settings.showPatrolRoutes}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main viewport component
// ---------------------------------------------------------------------------

export function HeistViewport({ scene }: { scene: HeistSceneState }) {
  const [settings, setSettings] = useState<ViewportSettings>(DEFAULT_SETTINGS);

  // Camera bounds computed once from the room layout (stable, won't shift as
  // tokens move between rooms).
  const cameraBounds = useMemo(() => computeCameraBounds(scene.map.rooms), [scene.map.rooms]);

  return (
    <div className="relative h-full w-full" style={{ minHeight: 300 }}>
      <ViewportControls settings={settings} onSettingsChange={setSettings} agents={scene.agents} />
      <Canvas
        orthographic
        camera={{
          position: [cameraBounds.centerX, cameraBounds.centerY, 10],
          zoom: cameraBounds.zoom,
          near: 0.1,
          far: 100,
        }}
        style={{ width: "100%", height: "100%", background: "#0a0a14" }}
      >
        <MapControls enableRotate={false} enableDamping={false} screenSpacePanning />
        <HeistScene scene={scene} settings={settings} />
      </Canvas>
    </div>
  );
}
