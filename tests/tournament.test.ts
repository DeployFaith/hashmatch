import { describe, expect, it } from "vitest";
import { runTournament } from "../src/tournament/runTournament.js";
import type { TournamentConfig } from "../src/tournament/types.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 42,
    maxTurns: 20,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    ...overrides,
  };
}

describe("Tournament Harness v0.1", () => {
  describe("determinism", () => {
    it("same config produces identical results", () => {
      const config = makeConfig({ seed: 123, rounds: 2 });
      const result1 = runTournament(config);
      const result2 = runTournament(config);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

    it("deterministic across multiple seeds", () => {
      for (const seed of [0, 1, 42, 999, 2147483647]) {
        const config = makeConfig({ seed });
        const a = runTournament(config);
        const b = runTournament(config);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    });

    it("different seeds produce different results", () => {
      const r1 = runTournament(makeConfig({ seed: 1 }));
      const r2 = runTournament(makeConfig({ seed: 999 }));
      expect(JSON.stringify(r1.matchSummaries)).not.toBe(JSON.stringify(r2.matchSummaries));
    });
  });

  describe("match count", () => {
    it("2 agents, 1 round => 1 match", () => {
      const result = runTournament(makeConfig({ rounds: 1 }));
      expect(result.matchSummaries).toHaveLength(1);
    });

    it("2 agents, 3 rounds => 3 matches", () => {
      const result = runTournament(makeConfig({ rounds: 3 }));
      expect(result.matchSummaries).toHaveLength(3);
    });

    it("N agents, R rounds => R * N*(N-1)/2 matches", () => {
      // With 2 agents and 5 rounds: 5 * 2*1/2 = 5
      const result = runTournament(makeConfig({ rounds: 5 }));
      const n = 2;
      const r = 5;
      const expected = r * ((n * (n - 1)) / 2);
      expect(result.matchSummaries).toHaveLength(expected);
    });
  });

  describe("standings", () => {
    it("contains all agents exactly once", () => {
      const config = makeConfig({ rounds: 2 });
      const result = runTournament(config);

      const standingIds = result.standings.map((s) => s.agentId).sort();
      expect(standingIds).toHaveLength(config.agentKeys.length);
      // Each agent appears exactly once
      expect(new Set(standingIds).size).toBe(config.agentKeys.length);
    });

    it("match counts in standings equal total matches per agent", () => {
      const config = makeConfig({ rounds: 3 });
      const result = runTournament(config);

      for (const row of result.standings) {
        // With 2 agents, each plays every round = 3 matches
        expect(row.matches).toBe(3);
        expect(row.wins + row.losses + row.draws).toBe(row.matches);
      }
    });

    it("points follow win=3, draw=1, loss=0 rule", () => {
      const result = runTournament(makeConfig({ rounds: 5 }));

      for (const row of result.standings) {
        expect(row.points).toBe(row.wins * 3 + row.draws * 1 + row.losses * 0);
      }
    });

    it("standings are sorted by points descending", () => {
      const result = runTournament(makeConfig({ seed: 42, rounds: 3 }));

      for (let i = 1; i < result.standings.length; i++) {
        expect(result.standings[i - 1].points).toBeGreaterThanOrEqual(result.standings[i].points);
      }
    });

    it("scoreDiff equals scoreFor minus scoreAgainst", () => {
      const result = runTournament(makeConfig({ rounds: 3 }));

      for (const row of result.standings) {
        expect(row.scoreDiff).toBe(row.scoreFor - row.scoreAgainst);
      }
    });
  });

  describe("match summaries", () => {
    it("each match has exactly 2 agentIds", () => {
      const result = runTournament(makeConfig({ rounds: 2 }));
      for (const m of result.matchSummaries) {
        expect(m.agentIds).toHaveLength(2);
      }
    });

    it("winner is null (draw) or one of the participating agents", () => {
      const result = runTournament(makeConfig({ rounds: 3 }));
      for (const m of result.matchSummaries) {
        if (m.winner !== null) {
          expect(m.agentIds).toContain(m.winner);
        }
      }
    });

    it("config is preserved in result", () => {
      const config = makeConfig({ seed: 777, rounds: 2 });
      const result = runTournament(config);
      expect(result.config).toEqual(config);
    });
  });

  describe("event logs", () => {
    it("event logs present when includeEventLogs is true", () => {
      const result = runTournament(makeConfig({ seed: 42, rounds: 2, includeEventLogs: true }));

      expect(result.matchLogs).toBeDefined();
      for (const m of result.matchSummaries) {
        const events = result.matchLogs![m.matchKey];
        expect(events).toBeDefined();
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].type).toBe("MatchStarted");
        expect(events[events.length - 1].type).toBe("MatchEnded");
      }
    });

    it("event logs absent when includeEventLogs is not set", () => {
      const result = runTournament(makeConfig({ seed: 42 }));
      expect(result.matchLogs).toBeUndefined();
    });

    it("event logs are deterministic", () => {
      const config = makeConfig({ seed: 123, rounds: 2, includeEventLogs: true });
      const r1 = runTournament(config);
      const r2 = runTournament(config);
      expect(JSON.stringify(r1.matchLogs)).toBe(JSON.stringify(r2.matchLogs));
    });
  });
});
