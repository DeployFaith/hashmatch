import { describe, expect, it } from "vitest";
import {
  createHeistScenario,
  type HeistObservation,
} from "../src/scenarios/heist/index.js";
import { parseResponse } from "../src/agents/ollama/heistAdapter.js";

describe("Heist action triangulation", () => {
  it("applies direct actions at the scenario layer", () => {
    const scenario = createHeistScenario();
    const agentId = "agent-1";
    let state = scenario.init(0, [agentId]);

    const pickupResult = scenario.adjudicate(state, agentId, {
      type: "pickup",
      itemId: "keycard-1",
    });
    expect(pickupResult.valid).toBe(true);
    state = pickupResult.state;
    expect(state.agents[agentId]?.inventory).toContain("keycard-1");

    const moveResult = scenario.adjudicate(state, agentId, {
      type: "move",
      toRoomId: "room-2",
    });
    expect(moveResult.valid).toBe(true);
    state = moveResult.state;
    expect(state.agents[agentId]?.roomId).toBe("room-2");

    const terminalResult = scenario.adjudicate(state, agentId, {
      type: "use_terminal",
      terminalId: "terminal-1",
    });
    expect(terminalResult.valid).toBe(true);
    expect(terminalResult.state.terminalProgress["terminal-1"]).toBe(1);
  });

  it("normalizes adapter actions from agent specs", () => {
    const scenario = createHeistScenario();
    const agentId = "agent-1";
    const state = scenario.init(0, [agentId]);
    const baseObservation = scenario.observe(state, agentId);

    const moveAction = parseResponse(
      "```json\n{\"type\":\"move\",\"target\":\"room-2\"}\n```",
      baseObservation,
    );
    expect(moveAction).toEqual({ type: "move", toRoomId: "room-2" });

    const terminalObservation: HeistObservation = {
      ...baseObservation,
      currentRoomId: "room-2",
      visibleEntities: [
        {
          id: "terminal-1",
          type: "terminal",
          roomId: "room-2",
          hackTurns: 2,
        },
      ],
    };

    const interactAction = parseResponse(
      "{\"type\":\"interact\",\"target\":\"terminal-1\"}",
      terminalObservation,
    );
    expect(interactAction).toEqual({ type: "use_terminal", terminalId: "terminal-1" });

    const useAction = parseResponse(
      "{\"type\":\"use\",\"item\":\"keycard-1\",\"target\":\"terminal-1\"}",
      terminalObservation,
    );
    expect(useAction).toEqual({ type: "use_terminal", terminalId: "terminal-1" });

    const useItemAction = parseResponse(
      "{\"type\":\"use_item\",\"itemId\":\"keycard-1\",\"target\":\"terminal-1\"}",
      terminalObservation,
    );
    expect(useItemAction).toEqual({ type: "use_terminal", terminalId: "terminal-1" });
  });
});
