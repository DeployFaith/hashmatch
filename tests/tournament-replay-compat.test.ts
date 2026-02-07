import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import type { TournamentConfig } from "../src/tournament/types.js";
import { parseJsonl } from "../src/lib/replay/parseJsonl.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 101,
    maxTurns: 5,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

describe("Tournament replay artifact compatibility", () => {
  it("writes replay artifacts that parse cleanly with the viewer parser", async () => {
    const config = makeConfig();
    const outDir = mkdtempSync(join(tmpdir(), "agent-league-replay-compat-"));

    try {
      const result = runTournament(config);
      await writeTournamentArtifacts(result, outDir);

      const tournamentPath = join(outDir, "tournament.json");
      const standingsPath = join(outDir, "standings.json");
      expect(existsSync(tournamentPath)).toBe(true);
      expect(existsSync(standingsPath)).toBe(true);

      for (const summary of result.matchSummaries) {
        const matchDir = join(outDir, "matches", summary.matchKey);
        const matchJsonlPath = join(matchDir, "match.jsonl");
        const matchSummaryPath = join(matchDir, "match_summary.json");

        expect(existsSync(matchJsonlPath)).toBe(true);
        expect(existsSync(matchSummaryPath)).toBe(true);

        const jsonlText = readFileSync(matchJsonlPath, "utf-8");
        const { events, errors } = parseJsonl(jsonlText);

        expect(errors).toEqual([]);
        expect(events.length).toBeGreaterThan(0);

        for (let i = 1; i < events.length; i++) {
          expect(events[i].seq).toBeGreaterThanOrEqual(events[i - 1].seq);
        }

        const matchIds = new Set(events.map((event) => event.matchId));
        expect(matchIds).toEqual(new Set([summary.matchId]));
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
