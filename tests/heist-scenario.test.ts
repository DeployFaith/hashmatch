import { describe, expect, it } from "vitest";
import type { HeistAction, HeistState } from "../src/scenarios/heist/index.js";
import { createHeistScenario } from "../src/scenarios/heist/index.js";

const agentIds = ["alice", "bob"];

function applyActions(state: HeistState, actions: Array<{ agentId: string; action: HeistAction }>) {
  const scenario = createHeistScenario();
  let current = state;
  for (const entry of actions) {
    const result = scenario.adjudicate(current, entry.agentId, entry.action);
    current = result.state;
  }
  return current;
}

describe("Heist scenario", () => {
  it("is deterministic for the same seed and actions", () => {
    const scenario = createHeistScenario();
    const state1 = scenario.init(42, agentIds);
    const state2 = scenario.init(42, agentIds);

    const actions = [
      { agentId: "alice", action: { type: "pickup", itemId: "keycard-1" } as const },
      { agentId: "alice", action: { type: "move", toRoomId: "room-2" } as const },
      { agentId: "bob", action: { type: "wait" } as const },
      { agentId: "alice", action: { type: "use_terminal", terminalId: "terminal-1" } as const },
      { agentId: "alice", action: { type: "use_terminal", terminalId: "terminal-1" } as const },
      { agentId: "alice", action: { type: "move", toRoomId: "room-3" } as const },
      { agentId: "alice", action: { type: "pickup", itemId: "loot-1" } as const },
    ];

    const endState1 = applyActions(state1, actions);
    const endState2 = applyActions(state2, actions);

    expect(endState1).toEqual(endState2);
    expect(scenario.score(endState1)).toEqual(scenario.score(endState2));
  });

  it("returns valid:false for invalid actions", () => {
    const scenario = createHeistScenario();
    const state = scenario.init(42, agentIds);
    const result = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-3" });

    expect(result.valid).toBe(false);
    expect(result.state.agents.alice.roomId).toBe("room-1");
    expect(result.state.turn).toBe(1);
  });

  it("persists terminal hack progress across movement", () => {
    const scenario = createHeistScenario();
    let state = scenario.init(42, agentIds);

    state = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-2" }).state;
    state = scenario.adjudicate(state, "alice", {
      type: "use_terminal",
      terminalId: "terminal-1",
    }).state;
    state = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-1" }).state;
    state = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-2" }).state;
    state = scenario.adjudicate(state, "alice", {
      type: "use_terminal",
      terminalId: "terminal-1",
    }).state;

    expect(state.terminalProgress["terminal-1"]).toBe(2);
    expect(state.terminalHacked["terminal-1"]).toBe(true);
  });

  it("requires a keycard to pass the locked door", () => {
    const scenario = createHeistScenario();
    let state = scenario.init(42, agentIds);

    state = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-2" }).state;
    const blocked = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-3" });

    expect(blocked.valid).toBe(false);
    expect(blocked.state.agents.alice.roomId).toBe("room-2");

    state = scenario.adjudicate(blocked.state, "alice", { type: "move", toRoomId: "room-1" }).state;
    state = scenario.adjudicate(state, "alice", { type: "pickup", itemId: "keycard-1" }).state;
    state = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-2" }).state;
    const allowed = scenario.adjudicate(state, "alice", { type: "move", toRoomId: "room-3" });

    expect(allowed.valid).toBe(true);
    expect(allowed.state.agents.alice.roomId).toBe("room-3");
  });
});
