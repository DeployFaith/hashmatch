import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Agent, AgentConfig, AgentContext } from "../src/contract/interfaces.js";
import type { AgentId } from "../src/contract/types.js";
import { runMatch } from "../src/engine/runMatch.js";
import { runMatchWithGateway } from "../src/engine/runMatchWithGateway.js";
import type { GatewayRuntimeConfig } from "../src/gateway/runtime.js";
import { createTranscriptWriter, GATEWAY_TRANSCRIPT_FILENAME } from "../src/gateway/transcript.js";
import {
  createHeistScenario,
  type HeistAction,
  type HeistObservation,
} from "../src/scenarios/heist/index.js";

function createWaitAgent(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(_observation: HeistObservation, _ctx: AgentContext): HeistAction {
      return { type: "wait" };
    },
  };
}

function createInvalidMoveAgent(id: AgentId): Agent<HeistObservation, HeistAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(_observation: HeistObservation, _ctx: AgentContext): HeistAction {
      return { type: "move", toRoomId: "unknown-room" };
    },
  };
}

describe("Heist competitive runner", () => {
  it("combines two solo attempts into a single match stream", async () => {
    const agentA = createWaitAgent("heist-a");
    const agentB = createWaitAgent("heist-b");

    const result = await runMatch(createHeistScenario(), [agentA, agentB], {
      seed: 101,
      maxTurns: 5,
    });

    const started = result.events[0];
    expect(started.type).toBe("MatchStarted");
    if (started.type === "MatchStarted") {
      expect(started.agentIds).toEqual([agentA.id, agentB.id]);
    }

    const ended = result.events[result.events.length - 1];
    expect(ended.type).toBe("MatchEnded");
    if (ended.type === "MatchEnded") {
      expect(ended.scores).toHaveProperty(agentA.id);
      expect(ended.scores).toHaveProperty(agentB.id);
    }

    const matchStartedCount = result.events.filter((event) => event.type === "MatchStarted").length;
    const matchEndedCount = result.events.filter((event) => event.type === "MatchEnded").length;
    expect(matchStartedCount).toBe(1);
    expect(matchEndedCount).toBe(1);

    result.events.forEach((event, index) => {
      expect(event.seq).toBe(index);
      expect(event.matchId).toBe(result.matchId);
    });

    const scoreA = result.scores[agentA.id];
    const scoreB = result.scores[agentB.id];
    const winner = scoreA === scoreB ? null : scoreA > scoreB ? agentA.id : agentB.id;
    expect(winner).toBeNull();

    if (ended.type === "MatchEnded" && ended.details && typeof ended.details === "object") {
      expect((ended.details as { winner?: string | null }).winner).toBeNull();
    }
  });

  it("produces deterministic winner comparisons from solo scores", async () => {
    const agentA = createWaitAgent("heist-a");
    const agentB = createInvalidMoveAgent("heist-b");

    const result = await runMatch(createHeistScenario(), [agentA, agentB], {
      seed: 202,
      maxTurns: 5,
    });

    const scoreA = result.scores[agentA.id];
    const scoreB = result.scores[agentB.id];
    const winner = scoreA === scoreB ? null : scoreA > scoreB ? agentA.id : agentB.id;

    expect(winner).toBe(agentA.id);

    const ended = result.events[result.events.length - 1];
    expect(ended.type).toBe("MatchEnded");
    if (ended.type === "MatchEnded" && ended.details && typeof ended.details === "object") {
      expect((ended.details as { winner?: string | null }).winner).toBe(agentA.id);
    }
  });
});

describe("Heist gateway runner", () => {
  it("writes gateway transcript entries for both agents", async () => {
    const agentA = createWaitAgent("heist-a");
    const agentB = createWaitAgent("heist-b");

    const tempDir = mkdtempSync(join(tmpdir(), "heist-gateway-"));
    try {
      const gatewayConfig: GatewayRuntimeConfig = {
        mode: "local",
        config: { defaultDeadlineMs: 1000, maxResponseBytes: 1024 * 1024 },
        transcriptWriter: createTranscriptWriter(tempDir),
      };

      await runMatchWithGateway(
        createHeistScenario(),
        [agentA, agentB],
        { seed: 303, maxTurns: 4 },
        gatewayConfig,
      );

      const transcriptPath = join(tempDir, GATEWAY_TRANSCRIPT_FILENAME);
      expect(existsSync(transcriptPath)).toBe(true);
      const transcript = readFileSync(transcriptPath, "utf-8").trim();
      expect(transcript.length).toBeGreaterThan(0);

      const agentIds = transcript
        .split("\n")
        .map((line) => JSON.parse(line) as { agentId?: string })
        .map((entry) => entry.agentId)
        .filter((agentId): agentId is string => typeof agentId === "string");

      expect(agentIds).toContain(agentA.id);
      expect(agentIds).toContain(agentB.id);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
