import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Agent, AgentConfig, AgentContext } from "../src/contract/interfaces.js";
import { toStableJsonl } from "../src/core/json.js";
import { runMatch } from "../src/engine/runMatch.js";
import { parseReplayJsonl } from "../src/lib/replay/parser.js";
import {
  createHeistScenario,
  type HeistAction,
  type HeistObservation,
} from "../src/scenarios/heist/index.js";
import { parseResponse } from "../src/agents/ollama/heistAdapter.js";

type RawEvent = {
  type: string;
  agentId?: string;
  turn?: number;
  rawSha256?: string;
  method?: string;
  fallbackReason?: string | null;
  chosenAction?: { type?: string };
};

const MAX_TURNS = 5;

function chooseAction(observation: HeistObservation): HeistAction {
  if (observation.visibleItems && observation.visibleItems.length > 0) {
    return { type: "pickup", itemId: observation.visibleItems[0].id };
  }

  const terminal = observation.visibleEntities?.find((entity) => entity.type === "terminal");
  if (terminal && terminal.type === "terminal") {
    return { type: "use_terminal", terminalId: terminal.id };
  }

  const adjacent = observation.adjacentRooms?.find((room) => room.passable);
  if (adjacent) {
    return { type: "move", toRoomId: adjacent.roomId };
  }

  if (observation.currentRoomId === observation._private?.extractionRoomId) {
    return { type: "extract" };
  }

  return { type: "wait" };
}

function formatRawOutput(observation: HeistObservation, cycleIndex: number): string {
  if (cycleIndex === 4) {
    return "I'll move to the vault";
  }
  if (cycleIndex === 5) {
    return "";
  }

  const action = chooseAction(observation);
  if (action.type === "wait") {
    throw new Error(`Expected non-wait action for turn ${observation.turn}`);
  }

  const payload = JSON.stringify(action);
  if (cycleIndex === 1) {
    return payload;
  }
  if (cycleIndex === 2) {
    return `Here is my action:\n\`\`\`json\n${payload}\n\`\`\`\nThanks.`;
  }
  return JSON.stringify({ action });
}

class CyclingDecoderAgent implements Agent<HeistObservation, HeistAction> {
  id: string;

  constructor(id: string) {
    this.id = id;
  }

  init(_config: AgentConfig) {}

  act(observation: HeistObservation, ctx: AgentContext): HeistAction {
    const cycleIndex = ((ctx.turn - 1) % 5) + 1;
    const rawText = formatRawOutput(observation, cycleIndex);
    const parsed = parseResponse(rawText, observation);
    if (!parsed) {
      throw new Error("Expected decoder to return a Heist action.");
    }
    return parsed;
  }
}

describe("Heist decoder smoke harness", () => {
  it("emits normalized actions and adjudication forensics across decoder styles", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "hashmatch-heist-decoder-smoke-"));
    try {
      for (const seed of [11, 22, 33]) {
        const scenario = createHeistScenario();
        const agent = new CyclingDecoderAgent(`decoder-${seed}`);
        const result = await runMatch(scenario, [agent], { seed, maxTurns: MAX_TURNS });
        const jsonl = toStableJsonl(result.events);
        const matchDir = join(tempDir, `match-${seed}`);
        mkdirSync(matchDir);
        const matchPath = join(matchDir, "match.jsonl");
        writeFileSync(matchPath, jsonl, "utf-8");

        const raw = readFileSync(matchPath, "utf-8");
        const events = raw
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as RawEvent);

        for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
          const rawOutputs = events.filter(
            (event) =>
              event.type === "AgentRawOutput" && event.agentId === agent.id && event.turn === turn,
          );
          expect(rawOutputs).toHaveLength(1);
          expect(rawOutputs[0]?.rawSha256).toBeTruthy();

          const adjudicated = events.filter(
            (event) =>
              event.type === "ActionAdjudicated" &&
              event.agentId === agent.id &&
              event.turn === turn,
          );
          expect(adjudicated).toHaveLength(1);

          const adjudicatedEvent = adjudicated[0];
          expect(adjudicatedEvent?.method).toBeTruthy();

          const actionType = adjudicatedEvent?.chosenAction?.type;
          if (turn <= 3) {
            expect(actionType).not.toBe("wait");
          } else {
            expect(actionType).toBe("wait");
            expect(adjudicatedEvent?.fallbackReason).toBeTruthy();
          }
        }

        const replay = parseReplayJsonl(raw);
        expect(replay.errors).toEqual([]);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
