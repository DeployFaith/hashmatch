import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../src/contract/types.js";
import { parseJsonl } from "../src/lib/replay/parseJsonl.js";
import { parseReplayJsonl } from "../src/lib/replay/parser.js";
import { foldEvents } from "../src/arena/heist/foldEvents.js";

const FIXTURE_PATH = "tests/fixtures/heist/heist.museum_night_seed15.match.jsonl";

describe("heist scene reducer", () => {
  it("folds a heist fixture into a scene state", () => {
    const text = readFileSync(FIXTURE_PATH, "utf-8");
    const parsed = parseJsonl(text);
    expect(parsed.errors).toEqual([]);

    const strictParsed = parseReplayJsonl(text);
    expect(strictParsed.errors).toEqual([]);

    const events = parsed.events.map((event) => event.raw as unknown as MatchEvent);
    const state = foldEvents(events);

    expect(Object.keys(state.map.rooms).length).toBeGreaterThan(0);
    expect(Object.keys(state.map.doors).length).toBeGreaterThan(0);
    expect(Object.values(state.guards).some((guard) => guard.patrolRoomIds.length > 0)).toBe(true);
    expect(Object.keys(state.entities).length).toBeGreaterThan(0);
    expect(Object.keys(state.items).length).toBeGreaterThan(0);
    expect(Object.values(state.agents).some((agent) => Array.isArray(agent.visibleRooms))).toBe(
      true,
    );
    expect(state.status).toBe("ended");
  });

  it("keeps folding when unknown events appear", () => {
    const text = readFileSync(FIXTURE_PATH, "utf-8");
    const parsed = parseJsonl(text);
    const events = parsed.events.map((event) => event.raw as unknown as MatchEvent);
    const matchId = events[0]?.matchId ?? "unknown";

    const unknownEvent = {
      type: "HeistMysteryEvent",
      seq: events[0]?.seq ?? 0.5,
      matchId,
    } as unknown as MatchEvent;

    const injected = [events[0], unknownEvent, ...events.slice(1)];
    const state = foldEvents(injected);

    expect(state.matchId).toBe(matchId);
    expect(Object.keys(state.map.rooms).length).toBeGreaterThan(0);
    expect(state.unknownEvents?.some((entry) => entry.type === "HeistMysteryEvent")).toBe(true);
  });
});
