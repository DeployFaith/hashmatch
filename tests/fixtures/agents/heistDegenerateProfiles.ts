// Deterministic degenerate-behavior profiles for FM classifier regression testing.
// These are NOT agents in the product sense — they are lab instruments that
// trigger specific failure modes so the classifier pipeline can be validated.
// Category: (C) keep deterministic, non-publishable (purpose: "test").
import type { Agent, AgentConfig, AgentContext } from "../../../src/contract/interfaces.js";
import type { AgentId } from "../../../src/contract/types.js";
import { attachActionForensics } from "../../../src/core/agentActionMetadata.js";
import type { NormalizationMethod } from "../../../src/core/decodeAgentAction.js";
import { sha256Hex } from "../../../src/core/hash.js";
import type { HeistAction, HeistObservation } from "../../../src/scenarios/heist/index.js";
import { parseResponse } from "../../../src/agents/ollama/heistAdapter.js";

function buildActionWithForensics(
  action: HeistAction,
  options: {
    rawText: string;
    method: NormalizationMethod;
    truncated: boolean;
    warnings?: string[];
    errors?: null;
    fallbackReason?: string | null;
    candidateAction?: unknown | null;
  },
): HeistAction {
  const rawBytes = Buffer.byteLength(options.rawText, "utf-8");
  const rawSha256 = sha256Hex(Buffer.from(options.rawText, "utf-8"));
  return attachActionForensics({ ...action }, {
    rawText: options.rawText,
    rawSha256,
    rawBytes,
    truncated: options.truncated,
    method: options.method,
    warnings: options.warnings ?? [],
    errors: options.errors ?? null,
    fallbackReason: options.fallbackReason ?? null,
    candidateAction: options.candidateAction ?? null,
    chosenAction: action,
  });
}

export function createWaitSpamProfile(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(_observation: HeistObservation, _ctx: AgentContext): HeistAction {
      return { type: "wait" };
    },
  };
}

export function createInvalidActionProfile(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(_observation: HeistObservation, _ctx: AgentContext): HeistAction {
      return { type: "teleport" } as unknown as HeistAction;
    },
  };
}

export function createActionSpaceCyclerProfile(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(observation: HeistObservation, _ctx: AgentContext): HeistAction {
      const roomIndex = observation.adjacentRooms.length > 1 ? 1 : 0;
      const nextRoom = observation.adjacentRooms[roomIndex]?.roomId;
      return nextRoom ? { type: "move", toRoomId: nextRoom } : { type: "wait" };
    },
  };
}

export function createFormatViolationProfile(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(observation: HeistObservation, _ctx: AgentContext): HeistAction {
      const nextRoom = observation.adjacentRooms[0]?.roomId ?? observation.currentRoomId;
      const rawText = [
        "Here is the action you requested:",
        "```json",
        JSON.stringify({ type: "move", toRoomId: nextRoom }),
        "```",
      ].join("\n");
      const parsed = parseResponse(rawText, observation);
      if (parsed) {
        return parsed;
      }
      return { type: "move", toRoomId: nextRoom };
    },
  };
}

export function createOutputBloatProfile(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(observation: HeistObservation, _ctx: AgentContext): HeistAction {
      const nextRoom = observation.adjacentRooms[0]?.roomId ?? observation.currentRoomId;
      const payload = "x".repeat(12_000);
      const rawText = `{"type":"move","toRoomId":"${nextRoom}","noise":"${payload}"}`;
      return buildActionWithForensics(
        { type: "move", toRoomId: nextRoom },
        {
          rawText,
          method: "direct-json",
          truncated: true,
        },
      );
    },
  };
}

export function createRepeatMalformedProfile(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(observation: HeistObservation, _ctx: AgentContext): HeistAction {
      const parsed = parseResponse("this is not json", observation);
      return parsed ?? { type: "wait" };
    },
  };
}

export function createCompositeDegenerateProfile(
  id: AgentId,
): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(_observation: HeistObservation, _ctx: AgentContext): HeistAction {
      const rawText = "```json\n{\"type\":\"wait\"}\n```\n" + "x".repeat(12_000);
      return buildActionWithForensics(
        { type: "wait" },
        {
          rawText,
          method: "fenced-json",
          truncated: true,
        },
      );
    },
  };
}

export function createCleanBaselineProfile(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(observation: HeistObservation, ctx: AgentContext): HeistAction {
      if (observation.visibleItems.length > 0) {
        return { type: "pickup", itemId: observation.visibleItems[0].id };
      }

      const terminal = observation.visibleEntities.find((entity) => entity.type === "terminal");
      if (terminal && "id" in terminal) {
        return { type: "use_terminal", terminalId: terminal.id };
      }

      const passableRooms = observation.adjacentRooms.filter((room) => room.passable);
      if (passableRooms.length > 0) {
        const roomIndex = ctx.turn % passableRooms.length;
        return { type: "move", toRoomId: passableRooms[roomIndex].roomId };
      }

      return { type: "wait" };
    },
  };
}
