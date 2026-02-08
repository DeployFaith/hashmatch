import { describe, expect, it } from "vitest";
import { generateHeistScenario } from "../src/games/heist/generator.js";

const manhattanDistance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const getBoundingBox = (positions: { x: number; y: number }[]) => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
  }
  return { minX, maxX, minY, maxY };
};

describe("heist spatial layout", () => {
  it("is deterministic for identical seeds", () => {
    const first = generateHeistScenario({ preset: "warehouse_breakin" }, 3);
    const second = generateHeistScenario({ preset: "warehouse_breakin" }, 3);
    const positionsA = new Map(first.map.rooms.map((room) => [room.id, room.position]));
    for (const room of second.map.rooms) {
      expect(room.position).toEqual(positionsA.get(room.id));
    }
  });

  it("does not overlap positions within scenarios", () => {
    const scenarios = [
      generateHeistScenario({ preset: "warehouse_breakin" }, 3),
      generateHeistScenario({ preset: "prison_escape" }, 2),
      generateHeistScenario({ preset: "museum_night" }, 8),
    ];

    for (const scenario of scenarios) {
      const seen = new Set<string>();
      for (const room of scenario.map.rooms) {
        const position = room.position;
        expect(position).toBeDefined();
        const key = `${position?.x},${position?.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("keeps doors between cardinally adjacent rooms", () => {
    const scenarios = [
      generateHeistScenario({ preset: "warehouse_breakin" }, 3),
      generateHeistScenario({ preset: "prison_escape" }, 2),
      generateHeistScenario({ preset: "museum_night" }, 8),
    ];

    for (const scenario of scenarios) {
      const positionById = new Map(
        scenario.map.rooms.map((room) => [room.id, room.position ?? { x: 0, y: 0 }]),
      );
      for (const door of scenario.map.doors) {
        const posA = positionById.get(door.roomA);
        const posB = positionById.get(door.roomB);
        expect(posA).toBeDefined();
        expect(posB).toBeDefined();
        if (!posA || !posB) {
          continue;
        }
        expect(manhattanDistance(posA, posB)).toBe(1);
      }
    }
  });

  it("keeps bounding box ratios under the limit", () => {
    const scenarios = [
      generateHeistScenario({ preset: "warehouse_breakin" }, 3),
      generateHeistScenario({ preset: "prison_escape" }, 2),
      generateHeistScenario({ preset: "museum_night" }, 8),
    ];

    for (const scenario of scenarios) {
      const positions = scenario.map.rooms
        .map((room) => room.position)
        .filter((position): position is { x: number; y: number } => Boolean(position));
      const { minX, maxX, minY, maxY } = getBoundingBox(positions);
      const width = Math.max(1, maxX - minX + 1);
      const height = Math.max(1, maxY - minY + 1);
      const ratio = Math.max(width, height) / Math.min(width, height);
      expect(ratio).toBeLessThanOrEqual(4);
    }
  });

  it("keeps vaults at least 3 cells from spawn on hard layouts", () => {
    const hardScenario = generateHeistScenario({ preset: "museum_night" }, 8);
    const expertScenario = generateHeistScenario(
      { rooms: { exact: 14 }, branchingFactor: 3, loopCount: 2, difficultyPreset: "hard" },
      68,
    );

    for (const scenario of [hardScenario, expertScenario]) {
      const spawn = scenario.map.rooms.find((room) => room.type === "spawn");
      const vault = scenario.map.rooms.find((room) => room.type === "vault");
      expect(spawn?.position).toBeDefined();
      expect(vault?.position).toBeDefined();
      if (!spawn?.position || !vault?.position) {
        continue;
      }
      expect(manhattanDistance(spawn.position, vault.position)).toBeGreaterThanOrEqual(3);
    }
  });
});
