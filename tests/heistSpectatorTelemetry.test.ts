import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJsonl } from "../src/lib/replay/parseJsonl.js";

const FIXTURE_PATH = "tests/fixtures/heist/heist.museum_night_seed15.match.jsonl";

describe("heist spectator telemetry", () => {
  it("emits enriched StateUpdated summaries", () => {
    const text = readFileSync(FIXTURE_PATH, "utf-8");
    const parsed = parseJsonl(text);
    expect(parsed.errors).toEqual([]);

    const stateUpdated = parsed.events.find((event) => event.type === "StateUpdated");
    expect(stateUpdated).toBeDefined();
    if (!stateUpdated) {
      return;
    }

    const summary = stateUpdated.raw.summary as Record<string, unknown> | undefined;
    expect(summary).toBeDefined();
    if (!summary) {
      return;
    }

    expect(summary.alertLevel).toBe(1);
    expect(summary.maxAlertLevel).toBe(3);
    expect(summary.tension).toBeCloseTo(1 / 3, 5);

    const guards = summary.guards as Record<string, unknown> | undefined;
    expect(guards).toBeDefined();
    const guardOne = guards?.["guard-1"] as Record<string, unknown> | undefined;
    expect(guardOne?.roomId).toBe("room-9");
    expect(guardOne?.patrolIndex).toBe(1);

    const doors = summary.doors as Record<string, unknown> | undefined;
    expect(doors?.["door-1"]).toEqual({
      accessible: true,
      locked: false,
      requiredItem: null,
    });
    expect((doors?.["door-2"] as Record<string, unknown>)?.accessible).toBe(false);

    const objectives = summary.objectives as Record<string, unknown> | undefined;
    expect(objectives?.["intel-1"]).toEqual({ secured: false });

    const extractedAgents = summary.extractedAgents as string[] | undefined;
    expect(extractedAgents).toEqual([]);

    const terminals = summary.terminals as Record<string, unknown> | undefined;
    expect(terminals?.["terminal-1"]).toEqual({
      hacked: false,
      progress: 0,
      roomId: "room-11",
    });

    const vaults = summary.vaults as Record<string, unknown> | undefined;
    expect(vaults?.["vault-1"]).toEqual({
      requiredItems: ["intel-1", "intel-2", "intel-3"],
      requirementsMet: false,
      roomId: "room-2",
    });
  });
});
