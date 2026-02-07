import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeMatchArtifacts } from "../src/server/matchArtifacts.js";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import type { MatchEvent } from "../src/contract/types.js";
import type { TournamentConfig } from "../src/tournament/types.js";

function makeTournamentConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 19,
    maxTurns: 12,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

function makeBaseEvents(matchId: string, agentIds: string[]): MatchEvent[] {
  return [
    {
      type: "MatchStarted",
      seq: 1,
      matchId,
      seed: 1,
      agentIds,
      scenarioName: "Number Guess",
      maxTurns: 10,
    },
    {
      type: "MatchEnded",
      seq: 2,
      matchId,
      reason: "completed",
      scores: {
        [agentIds[0]]: 1,
        [agentIds[1]]: 0,
      },
      turns: 1,
    },
  ];
}

describe("Broadcast manifest (match artifacts)", () => {
  it("writes broadcast_manifest.json and omits moments when not present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashmatch-broadcast-match-"));
    const matchId = "match-1";
    const agentIds = ["random-0", "baseline-1"];

    try {
      await writeMatchArtifacts({
        matchId,
        scenarioName: "Number Guess",
        scenarioKey: "numberGuess",
        agentKeys: ["random", "baseline"],
        seed: 1,
        maxTurns: 10,
        events: makeBaseEvents(matchId, agentIds),
        scores: {
          [agentIds[0]]: 1,
          [agentIds[1]]: 0,
        },
        turns: 1,
        reason: "completed",
        matchDir: dir,
      });

      const manifestRaw = readFileSync(join(dir, "broadcast_manifest.json"), "utf-8");
      const manifest = JSON.parse(manifestRaw) as {
        bundleId: string;
        bundleType: string;
        modeProfileId: string;
        createdBy: string;
        files: Array<{ path: string; class: string }>;
      };
      const files = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));

      expect(manifest.bundleId).toBe(matchId);
      expect(manifest.bundleType).toBe("match");
      expect(manifest.modeProfileId).toBe("sandbox");
      expect(manifest.createdBy).toBe("local-runner");
      expect(files).toEqual(
        expect.arrayContaining([
          { path: "match.jsonl", class: "truth" },
          { path: "match_manifest.json", class: "truth" },
          { path: "match_summary.json", class: "telemetry" },
        ]),
      );
      expect(files).toHaveLength(3);
      expect(existsSync(join(dir, "moments.json"))).toBe(false);
      expect(files.find((file) => file.path === "moments.json")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("includes moments.json when moments are generated", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashmatch-broadcast-match-moments-"));
    const matchId = "match-2";
    const agentIds = ["random-0", "baseline-1"];
    const events: MatchEvent[] = [
      {
        type: "MatchStarted",
        seq: 1,
        matchId,
        seed: 2,
        agentIds,
        scenarioName: "Number Guess",
        maxTurns: 10,
      },
      {
        type: "AgentError",
        seq: 2,
        matchId,
        agentId: agentIds[0],
        turn: 1,
        message: "Invalid action",
      },
      {
        type: "MatchEnded",
        seq: 3,
        matchId,
        reason: "completed",
        scores: {
          [agentIds[0]]: 0,
          [agentIds[1]]: 1,
        },
        turns: 1,
      },
    ];

    try {
      await writeMatchArtifacts({
        matchId,
        scenarioName: "Number Guess",
        scenarioKey: "numberGuess",
        agentKeys: ["random", "baseline"],
        seed: 2,
        maxTurns: 10,
        events,
        scores: {
          [agentIds[0]]: 0,
          [agentIds[1]]: 1,
        },
        turns: 1,
        reason: "completed",
        matchDir: dir,
      });

      const manifestRaw = readFileSync(join(dir, "broadcast_manifest.json"), "utf-8");
      const manifest = JSON.parse(manifestRaw) as {
        files: Array<{ path: string; class: string }>;
      };
      const files = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));

      expect(existsSync(join(dir, "moments.json"))).toBe(true);
      expect(files).toEqual(
        expect.arrayContaining([
          { path: "match.jsonl", class: "truth" },
          { path: "match_manifest.json", class: "truth" },
          { path: "match_summary.json", class: "telemetry" },
          { path: "moments.json", class: "telemetry" },
        ]),
      );
      expect(files).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Broadcast manifest (tournament artifacts)", () => {
  it("writes broadcast_manifest.json with classified tournament files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashmatch-broadcast-tournament-"));

    try {
      const config = makeTournamentConfig({ seed: 24 });
      const result = runTournament(config);
      await writeTournamentArtifacts(result, dir);

      const manifestRaw = readFileSync(join(dir, "broadcast_manifest.json"), "utf-8");
      const manifest = JSON.parse(manifestRaw) as {
        bundleId: string;
        bundleType: string;
        modeProfileId: string;
        createdBy: string;
        files: Array<{ path: string; class: string }>;
      };

      expect(manifest.bundleType).toBe("tournament");
      expect(manifest.bundleId).toBe(String(result.tournament.tournamentSeed));
      expect(manifest.modeProfileId).toBe("sandbox");
      expect(manifest.createdBy).toBe("tournament-harness");
      expect(manifest.files).toEqual(
        expect.arrayContaining([
          { path: "tournament_manifest.json", class: "truth" },
          { path: "tournament.json", class: "truth" },
          { path: "standings.json", class: "telemetry" },
        ]),
      );

      const matchKey = result.matchSummaries[0].matchKey;
      expect(manifest.files).toEqual(
        expect.arrayContaining([
          { path: `matches/${matchKey}/match.jsonl`, class: "truth" },
          { path: `matches/${matchKey}/match_manifest.json`, class: "truth" },
          { path: `matches/${matchKey}/match_summary.json`, class: "telemetry" },
        ]),
      );

      const momentsPath = join(dir, "matches", matchKey, "moments.json");
      const momentsEntry = manifest.files.find(
        (file) => file.path === `matches/${matchKey}/moments.json`,
      );
      if (existsSync(momentsPath)) {
        expect(momentsEntry).toEqual({ path: `matches/${matchKey}/moments.json`, class: "telemetry" });
      } else {
        expect(momentsEntry).toBeUndefined();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
