import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Agent } from "../src/contract/interfaces.js";
import type { AgentId, MatchEvent } from "../src/contract/types.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createHeistScenario } from "../src/scenarios/heist/index.js";
import type { HeistAction, HeistObservation } from "../src/scenarios/heist/index.js";
import type { MatchManifest, MatchSummary } from "../src/tournament/types.js";
import { writeMatchArtifactsCore } from "../src/tournament/writeMatchArtifacts.js";
import {
  createActionSpaceCyclerAgent,
  createCleanDiverseAgent,
  createFormatHackerAgent,
  createInvalidActionAgent,
  createOutputBloatAgent,
  createRepeatMalformedAgent,
  createUglyProfileAgent,
  createWaitSpamAgent,
} from "./fixtures/agents/heistFixtureAgents.js";

const FIXED_CREATED_AT = "2024-01-01T00:00:00.000Z";

function determineWinner(scores: Record<AgentId, number>, agentIds: AgentId[]): AgentId | null {
  let winner: AgentId | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let hasTie = false;

  for (const agentId of agentIds) {
    const score = scores[agentId] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      winner = agentId;
      hasTie = false;
    } else if (score === bestScore) {
      hasTie = true;
    }
  }

  return hasTie ? null : winner;
}

function readMatchJsonl(matchDir: string): MatchEvent[] {
  const raw = readFileSync(join(matchDir, "match.jsonl"), "utf-8").trim();
  if (!raw) {
    return [];
  }
  return raw.split("\n").map((line) => JSON.parse(line) as MatchEvent);
}

function readMatchSummary(matchDir: string): MatchSummary {
  const raw = readFileSync(join(matchDir, "match_summary.json"), "utf-8");
  return JSON.parse(raw) as MatchSummary;
}

async function runHeistMatchWithArtifacts(options: {
  agents: Agent<HeistObservation, HeistAction>[];
  maxTurns: number;
  seed: number;
}) {
  const scenario = createHeistScenario();
  const result = await runMatch(scenario, options.agents, {
    seed: options.seed,
    maxTurns: options.maxTurns,
  });

  const matchId = `match-${options.seed}`;
  const agentIds = options.agents.map((agent) => agent.id);
  const lastEvent = result.events[result.events.length - 1];
  const reason = lastEvent?.type === "MatchEnded" ? lastEvent.reason : "unknown";

  const manifest: MatchManifest = {
    matchId,
    modeProfileId: "test",
    scenario: {
      id: scenario.name,
      version: null,
      contractVersion: null,
      contentHash: null,
    },
    agents: agentIds.map((id) => ({
      id,
      version: null,
      contentHash: null,
    })),
    config: {
      maxTurns: options.maxTurns,
      maxTurnTimeMs: result.maxTurnTimeMs,
      seed: options.seed,
      seedDerivationInputs: {
        tournamentSeed: options.seed,
        matchKey: matchId,
      },
    },
    runner: {
      name: "test-runner",
      version: null,
      gitCommit: null,
    },
    createdAt: FIXED_CREATED_AT,
  };

  const summary: MatchSummary = {
    matchId,
    matchKey: matchId,
    seed: options.seed,
    agentIds,
    scores: result.scores,
    timeoutsPerAgent: result.timeoutsPerAgent,
    ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
    winner: determineWinner(result.scores, agentIds),
    turns: result.turns,
    reason,
  };

  const matchDir = mkdtempSync(join(tmpdir(), "hashmatch-redteam-"));
  await writeMatchArtifactsCore({
    matchDir,
    events: result.events,
    manifest,
    summary,
    scenarioHints: scenario.getScenarioHints(),
  });

  return { matchDir, agentIds };
}

describe("Red-team fixture agents (integration)", () => {
  it("flags wait spam in truth actions and FM telemetry", async () => {
    const agents = [createWaitSpamAgent("wait-0"), createWaitSpamAgent("wait-1")];
    const { matchDir, agentIds } = await runHeistMatchWithArtifacts({
      agents,
      maxTurns: 12,
      seed: 11,
    });

    try {
      const events = readMatchJsonl(matchDir);
      for (const event of events) {
        expect("failureModes" in event).toBe(false);
      }

      const actionEvents = events.filter((event) => event.type === "ActionSubmitted");
      expect(actionEvents.length).toBeGreaterThanOrEqual(10);
      for (const event of actionEvents) {
        expect((event as { action?: { type?: string } }).action?.type).toBe("wait");
      }

      const summary = readMatchSummary(matchDir);
      expect(summary.failureModes).toBeDefined();
      for (const agentId of agentIds) {
        const hits = summary.failureModes?.byAgentId[agentId] ?? [];
        const waitSpam = hits.find((hit) => hit.id === "FM-10");
        expect(waitSpam?.count).toBeGreaterThanOrEqual(5);
        const lowDiversity = hits.find((hit) => hit.id === "FM-16");
        if (lowDiversity) {
          expect(lowDiversity.count).toBeGreaterThan(0);
        }
      }
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });

  it("records InvalidAction events and FM-06 for hallucinated action types", async () => {
    const invalidAgent = createInvalidActionAgent("invalid-0");
    const cleanAgent = createCleanDiverseAgent("clean-1");
    const { matchDir } = await runHeistMatchWithArtifacts({
      agents: [invalidAgent, cleanAgent],
      maxTurns: 6,
      seed: 17,
    });

    try {
      const events = readMatchJsonl(matchDir);
      const invalidEvents = events.filter(
        (event) => event.type === "InvalidAction" && event.agentId === invalidAgent.id,
      );
      expect(invalidEvents.length).toBeGreaterThan(0);

      const summary = readMatchSummary(matchDir);
      const hits = summary.failureModes?.byAgentId[invalidAgent.id] ?? [];
      const hallucinated = hits.find((hit) => hit.id === "FM-06");
      expect(hallucinated?.count).toBe(invalidEvents.length);
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });

  it("flags action-space cycling with FM-16", async () => {
    const cycler = createActionSpaceCyclerAgent("cycler-0");
    const cleanAgent = createCleanDiverseAgent("clean-1");
    const { matchDir } = await runHeistMatchWithArtifacts({
      agents: [cycler, cleanAgent],
      maxTurns: 12,
      seed: 19,
    });

    try {
      const events = readMatchJsonl(matchDir);
      const submissions = events.filter(
        (event) => event.type === "ActionSubmitted" && event.agentId === cycler.id,
      ) as Array<{ action?: { type?: string } }>;
      expect(submissions.length).toBeGreaterThan(0);
      for (const submission of submissions) {
        expect(submission.action?.type).toBe("move");
      }

      const summary = readMatchSummary(matchDir);
      const hits = summary.failureModes?.byAgentId[cycler.id] ?? [];
      const lowDiversity = hits.find((hit) => hit.id === "FM-16");
      expect(lowDiversity?.count).toBeGreaterThan(0);
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });

  it("marks fenced JSON outputs with FM-13 telemetry", async () => {
    const formatHacker = createFormatHackerAgent("format-0");
    const cleanAgent = createCleanDiverseAgent("clean-1");
    const { matchDir } = await runHeistMatchWithArtifacts({
      agents: [formatHacker, cleanAgent],
      maxTurns: 3,
      seed: 29,
    });

    try {
      const events = readMatchJsonl(matchDir);
      const adjudications = events.filter(
        (event) => event.type === "ActionAdjudicated" && event.agentId === formatHacker.id,
      ) as Array<{ method?: string }>;
      expect(adjudications.length).toBeGreaterThan(0);
      for (const adjudication of adjudications) {
        expect(adjudication.method).toBe("fenced-json");
      }
      const rawOutputs = events.filter(
        (event) => event.type === "AgentRawOutput" && event.agentId === formatHacker.id,
      );
      expect(rawOutputs.length).toBe(adjudications.length);

      const summary = readMatchSummary(matchDir);
      const hits = summary.failureModes?.byAgentId[formatHacker.id] ?? [];
      const jsonRecovery = hits.find((hit) => hit.id === "FM-13");
      expect(jsonRecovery?.count).toBe(adjudications.length);
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });

  it("flags truncated agent output with FM-12", async () => {
    const bloatAgent = createOutputBloatAgent("bloat-0");
    const cleanAgent = createCleanDiverseAgent("clean-1");
    const { matchDir } = await runHeistMatchWithArtifacts({
      agents: [bloatAgent, cleanAgent],
      maxTurns: 3,
      seed: 31,
    });

    try {
      const events = readMatchJsonl(matchDir);
      const rawOutputs = events.filter(
        (event) => event.type === "AgentRawOutput" && event.agentId === bloatAgent.id,
      ) as Array<{ truncated?: boolean }>;
      expect(rawOutputs.length).toBeGreaterThan(0);
      for (const rawOutput of rawOutputs) {
        expect(rawOutput.truncated).toBe(true);
      }

      const summary = readMatchSummary(matchDir);
      const hits = summary.failureModes?.byAgentId[bloatAgent.id] ?? [];
      const bloatHit = hits.find((hit) => hit.id === "FM-12");
      expect(bloatHit?.count).toBe(rawOutputs.length);
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });

  it("keeps malformed output diagnostics deterministic across turns", async () => {
    const malformed = createRepeatMalformedAgent("malformed-0");
    const cleanAgent = createCleanDiverseAgent("clean-1");
    const { matchDir } = await runHeistMatchWithArtifacts({
      agents: [malformed, cleanAgent],
      maxTurns: 2,
      seed: 37,
    });

    try {
      const events = readMatchJsonl(matchDir);
      const adjudications = events.filter(
        (event) => event.type === "ActionAdjudicated" && event.agentId === malformed.id,
      ) as Array<{ method?: string; fallbackReason?: string | null; warnings?: string[] }>;
      expect(adjudications.length).toBe(2);
      const [first, second] = adjudications;
      expect(first.method).toBe("failed");
      expect(second.method).toBe(first.method);
      expect(second.fallbackReason).toBe(first.fallbackReason);
      expect(second.warnings).toEqual(first.warnings);

      const summary = readMatchSummary(matchDir);
      const hits = summary.failureModes?.byAgentId[malformed.id] ?? [];
      const jsonRecovery = hits.find((hit) => hit.id === "FM-13");
      expect(jsonRecovery?.count).toBe(2);
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });

  it("emits non-trivial FM profiles for ugly data", async () => {
    const uglyAgent = createUglyProfileAgent("ugly-0");
    const cleanAgent = createCleanDiverseAgent("clean-1");
    const { matchDir } = await runHeistMatchWithArtifacts({
      agents: [uglyAgent, cleanAgent],
      maxTurns: 6,
      seed: 41,
    });

    try {
      const summary = readMatchSummary(matchDir);
      const hits = summary.failureModes?.byAgentId[uglyAgent.id] ?? [];
      const hitIds = new Set(hits.map((hit) => hit.id));
      expect(hitIds.has("FM-10")).toBe(true);
      expect(hitIds.has("FM-12")).toBe(true);
      expect(hitIds.has("FM-13")).toBe(true);

      const events = readMatchJsonl(matchDir);
      const rawOutputs = events.filter(
        (event) => event.type === "AgentRawOutput" && event.agentId === uglyAgent.id,
      ) as Array<{ truncated?: boolean }>;
      expect(rawOutputs.length).toBeGreaterThan(0);
      for (const rawOutput of rawOutputs) {
        expect(rawOutput.truncated).toBe(true);
      }
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });

  it("emits no FM hits for clean diverse agents", async () => {
    const agentA = createCleanDiverseAgent("clean-0");
    const agentB = createCleanDiverseAgent("clean-1");
    const { matchDir, agentIds } = await runHeistMatchWithArtifacts({
      agents: [agentA, agentB],
      maxTurns: 8,
      seed: 23,
    });

    try {
      const summary = readMatchSummary(matchDir);
      for (const agentId of agentIds) {
        const hits = summary.failureModes?.byAgentId[agentId] ?? [];
        expect(hits).toHaveLength(0);
      }
    } finally {
      rmSync(matchDir, { recursive: true, force: true });
    }
  });
});
