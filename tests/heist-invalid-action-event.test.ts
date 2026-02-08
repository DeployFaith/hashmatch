import { describe, expect, it } from "vitest";
import type { Agent, AgentConfig, AgentContext } from "../src/contract/interfaces.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createHeistScenario } from "../src/scenarios/heist/index.js";
import { parseResponse } from "../src/agents/ollama/heistAdapter.js";
import type { HeistAction, HeistObservation } from "../src/scenarios/heist/index.js";

describe("Heist invalid action events", () => {
  it("emits InvalidAction when the scenario rejects an action", async () => {
    const invalidMoveAgent: Agent<HeistObservation, HeistAction> = {
      id: "invalid-agent",
      init(_config: AgentConfig) {},
      act(_observation: HeistObservation, _ctx: AgentContext): HeistAction {
        return { type: "move", toRoomId: "unknown-room" };
      },
    };

    const result = await runMatch(createHeistScenario(), [invalidMoveAgent], {
      seed: 999,
      maxTurns: 1,
    });

    const invalidEvents = result.events.filter((event) => event.type === "InvalidAction");
    expect(invalidEvents).toHaveLength(1);

    const invalid = invalidEvents[0];
    if (invalid?.type === "InvalidAction") {
      expect(invalid.reason).toContain("No door connects");
      expect(invalid.attemptedAction).toEqual({ type: "move", toRoomId: "unknown-room" });
    }
  });

  it("emits InvalidAction when decoder falls back to the default action", async () => {
    const decoderFallbackAgent: Agent<HeistObservation, HeistAction> = {
      id: "decoder-fallback-agent",
      init(_config: AgentConfig) {},
      act(observation: HeistObservation, _ctx: AgentContext): HeistAction {
        const action = parseResponse("not json", observation);
        if (!action) {
          throw new Error("Expected fallback action from decoder.");
        }
        return action;
      },
    };

    const result = await runMatch(createHeistScenario(), [decoderFallbackAgent], {
      seed: 1001,
      maxTurns: 1,
    });

    const invalidEvents = result.events.filter((event) => event.type === "InvalidAction");
    expect(invalidEvents).toHaveLength(1);

    const invalid = invalidEvents[0];
    if (invalid?.type === "InvalidAction") {
      expect(invalid.reason).toContain("Decoder failed to find JSON");
      expect(invalid.attemptedAction).toBeNull();
    }
  });
});
