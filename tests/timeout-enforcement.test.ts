import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, AgentContext } from "../src/contract/interfaces.js";
import type { AgentId, JsonValue } from "../src/contract/types.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createNumberGuessScenario } from "../src/scenarios/numberGuess/index.js";
import type {
  NumberGuessAction,
  NumberGuessObservation,
} from "../src/scenarios/numberGuess/index.js";
import { writeMatchArtifacts } from "../src/server/matchArtifacts.js";
import { verifyMatchDirectory } from "../src/cli/verify-match.js";
import { verifyTournamentDirectory } from "../src/cli/verify-tournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import type {
  MatchSpec,
  MatchSummary,
  StandingsRow,
  TournamentResult,
} from "../src/tournament/types.js";

function createTimeoutAgent(id: AgentId): Agent<NumberGuessObservation, NumberGuessAction> {
  return {
    id,
    init(): void {},
    act(): NumberGuessAction | Promise<NumberGuessAction> {
      return new Promise(() => {});
    },
  };
}

function createConstantAgent(
  id: AgentId,
  guess: number,
): Agent<NumberGuessObservation, NumberGuessAction> {
  return {
    id,
    init(): void {},
    act(): NumberGuessAction {
      return { type: "guess", value: guess };
    },
  };
}

describe("maxTurnTimeMs enforcement", () => {
  it("applies default action and emits AgentError on timeout", async () => {
    vi.useFakeTimers();
    const scenario = createNumberGuessScenario();
    const timeoutAgent = createTimeoutAgent("slow-0");
    const fastAgent = createConstantAgent("fast-1", 1);

    const matchPromise = runMatch(scenario, [timeoutAgent, fastAgent], {
      seed: 11,
      maxTurns: 1,
      maxTurnTimeMs: 5,
    });

    await vi.advanceTimersByTimeAsync(10);
    const result = await matchPromise;
    vi.useRealTimers();

    const timeoutErrorIndex = result.events.findIndex(
      (event) =>
        event.type === "AgentError" && event.agentId === "slow-0" && event.errorType === "timeout",
    );
    const defaultActionIndex = result.events.findIndex(
      (event) =>
        event.type === "ActionSubmitted" &&
        event.agentId === "slow-0" &&
        (event.action as JsonValue) &&
        (event.action as Record<string, JsonValue>).type === "guess",
    );

    expect(timeoutErrorIndex).toBeGreaterThanOrEqual(0);
    expect(defaultActionIndex).toBeGreaterThan(timeoutErrorIndex);
  });

  it("forfeits after 3 consecutive timeouts", async () => {
    vi.useFakeTimers();
    const scenario = createNumberGuessScenario();
    const timeoutAgent = createTimeoutAgent("slow-0");
    const fastAgent = createConstantAgent("fast-1", 1);

    const matchPromise = runMatch(scenario, [timeoutAgent, fastAgent], {
      seed: 22,
      maxTurns: 10,
      maxTurnTimeMs: 5,
      maxConsecutiveTimeouts: 3,
    });

    await vi.runAllTimersAsync();
    const result = await matchPromise;
    vi.useRealTimers();

    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent.type).toBe("MatchEnded");
    if (lastEvent.type === "MatchEnded") {
      expect(lastEvent.reason).toBe("agentForfeited");
    }
    expect(result.forfeitedBy).toBe("slow-0");
    expect(result.timeoutsPerAgent["slow-0"]).toBe(3);
    expect(result.scores["fast-1"]).toBeGreaterThan(result.scores["slow-0"]);
  });

  it("resets consecutive timeouts after recovery", async () => {
    vi.useFakeTimers();
    const scenario = createNumberGuessScenario();
    let calls = 0;
    const recoveringAgent: Agent<NumberGuessObservation, NumberGuessAction> = {
      id: "recover-0",
      init(): void {},
      act(
        _observation: NumberGuessObservation,
        _ctx: AgentContext,
      ): NumberGuessAction | Promise<NumberGuessAction> {
        calls += 1;
        if (calls === 1) {
          return new Promise(() => {});
        }
        return { type: "guess", value: 1 };
      },
    };

    const matchPromise = runMatch(scenario, [recoveringAgent], {
      seed: 33,
      maxTurns: 2,
      maxTurnTimeMs: 5,
      maxConsecutiveTimeouts: 3,
    });

    await vi.runAllTimersAsync();
    const result = await matchPromise;
    vi.useRealTimers();

    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent.type).toBe("MatchEnded");
    if (lastEvent.type === "MatchEnded") {
      expect(lastEvent.reason).not.toBe("agentForfeited");
    }
    expect(result.forfeitedBy).toBeUndefined();
    expect(result.timeoutsPerAgent["recover-0"]).toBe(1);
  });

  it("verify-match and verify-tournament pass with timeout events", async () => {
    vi.useFakeTimers();
    const scenario = createNumberGuessScenario();
    const timeoutAgent = createTimeoutAgent("random-0");
    const fastAgent = createConstantAgent("baseline-1", 1);

    const matchPromise = runMatch(scenario, [timeoutAgent, fastAgent], {
      seed: 44,
      maxTurns: 3,
      maxTurnTimeMs: 5,
      maxConsecutiveTimeouts: 3,
    });
    await vi.runAllTimersAsync();
    const result = await matchPromise;
    vi.useRealTimers();

    const matchDir = mkdtempSync(join(tmpdir(), "timeout-match-"));
    const matchKey = "RR:random-0-vs-baseline-1:round1";
    const lastEvent = result.events[result.events.length - 1];
    const endedReason = lastEvent.type === "MatchEnded" ? lastEvent.reason : "unknown";

    await writeMatchArtifacts({
      matchId: result.matchId,
      scenarioName: scenario.name,
      scenarioKey: "numberGuess",
      agentKeys: ["random", "baseline"],
      seed: result.seed,
      maxTurns: 3,
      maxTurnTimeMs: result.maxTurnTimeMs,
      events: result.events,
      scores: result.scores,
      timeoutsPerAgent: result.timeoutsPerAgent,
      ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
      turns: result.turns,
      reason: endedReason,
      matchDir,
    });

    const matchReport = await verifyMatchDirectory(matchDir);
    expect(matchReport.status).toBe("pass");

    const summary: MatchSummary = {
      matchId: result.matchId,
      matchKey,
      seed: result.seed,
      agentIds: ["random-0", "baseline-1"],
      scores: result.scores,
      timeoutsPerAgent: result.timeoutsPerAgent,
      ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
      winner:
        (result.scores["random-0"] ?? 0) > (result.scores["baseline-1"] ?? 0)
          ? "random-0"
          : (result.scores["random-0"] ?? 0) < (result.scores["baseline-1"] ?? 0)
            ? "baseline-1"
            : null,
      turns: result.turns,
      reason: endedReason,
    };

    const matchSpec: MatchSpec = {
      matchKey,
      seed: result.seed,
      scenarioName: scenario.name,
      agentIds: summary.agentIds,
      maxTurns: 3,
    };

    const standings: StandingsRow[] = summary.agentIds.map((agentId) => ({
      agentId,
      matches: 1,
      wins: summary.winner === agentId ? 1 : 0,
      losses: summary.winner && summary.winner !== agentId ? 1 : 0,
      draws: summary.winner === null ? 1 : 0,
      points: summary.winner === agentId ? 3 : summary.winner === null ? 1 : 0,
      scoreFor: summary.scores[agentId] ?? 0,
      scoreAgainst: summary.agentIds
        .filter((id) => id !== agentId)
        .reduce((sum, id) => sum + (summary.scores[id] ?? 0), 0),
      scoreDiff: 0,
    }));
    standings.forEach((row) => {
      row.scoreDiff = row.scoreFor - row.scoreAgainst;
    });

    const tournamentResult: TournamentResult = {
      config: {
        seed: result.seed,
        maxTurns: 3,
        rounds: 1,
        scenarioKey: "numberGuess",
        agentKeys: ["random", "baseline"],
        includeEventLogs: true,
      },
      tournament: {
        tournamentSeed: result.seed,
        scenarioName: scenario.name,
        agents: summary.agentIds,
        matches: [matchSpec],
      },
      matchSummaries: [summary],
      standings,
      matchLogs: {
        [matchKey]: result.events,
      },
    };

    const tournamentDir = mkdtempSync(join(tmpdir(), "timeout-tournament-"));
    await writeTournamentArtifacts(tournamentResult, tournamentDir);
    const tournamentReport = await verifyTournamentDirectory(tournamentDir);
    expect(tournamentReport.status).toBe("pass");

    rmSync(matchDir, { recursive: true, force: true });
    rmSync(tournamentDir, { recursive: true, force: true });
  });
});
