import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../src/contract/types.js";
import { foldEvents } from "../src/arena/heist/foldEvents.js";
import { computeRoomLayout } from "../src/arena/heist/layout.js";
import { parseJsonl } from "../src/lib/replay/parseJsonl.js";

const FIXTURE_PATH = "tests/fixtures/heist/heist.museum_night_seed15.match.jsonl";

const loadFixtureState = () => {
  const text = readFileSync(FIXTURE_PATH, "utf-8");
  const parsed = parseJsonl(text);
  expect(parsed.errors).toEqual([]);
  const events = parsed.events.map((event) => event.raw as unknown as MatchEvent);
  return foldEvents(events);
};

const findSpawnRoomId = (rooms: Record<string, { roomId: string; label?: string }>) => {
  const spawnIds = Object.values(rooms)
    .filter((room) => room.label === "spawn")
    .map((room) => room.roomId)
    .sort();
  if (spawnIds.length > 0) {
    return spawnIds[0];
  }
  return Object.keys(rooms).sort()[0];
};

describe("heist room layout", () => {
  it("all rooms get positions", () => {
    const state = loadFixtureState();

    for (const room of Object.values(state.map.rooms)) {
      expect(room.positionHint).toBeDefined();
      expect(typeof room.positionHint?.x).toBe("number");
      expect(Number.isFinite(room.positionHint?.x)).toBe(true);
      expect(typeof room.positionHint?.y).toBe("number");
      expect(Number.isFinite(room.positionHint?.y)).toBe(true);
    }
  });

  it("layout is deterministic", () => {
    const state = loadFixtureState();
    const spawnRoomId = findSpawnRoomId(state.map.rooms);

    const layoutA = computeRoomLayout(state.map.rooms, state.map.doors, spawnRoomId);
    const layoutB = computeRoomLayout(state.map.rooms, state.map.doors, spawnRoomId);

    expect(JSON.stringify(layoutA)).toBe(JSON.stringify(layoutB));
  });

  it("spawn room is at origin", () => {
    const state = loadFixtureState();
    const spawnRoomId = findSpawnRoomId(state.map.rooms);
    const spawnRoom = state.map.rooms[spawnRoomId];

    expect(spawnRoom.positionHint).toEqual({ x: 0, y: 0 });
  });

  it("no overlapping positions", () => {
    const state = loadFixtureState();
    const positions = new Set<string>();

    for (const room of Object.values(state.map.rooms)) {
      const position = room.positionHint;
      expect(position).toBeDefined();
      const key = `${position?.x},${position?.y}`;
      expect(positions.has(key)).toBe(false);
      positions.add(key);
    }
  });
});
