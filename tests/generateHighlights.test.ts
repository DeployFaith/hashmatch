import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stableStringify } from "../src/core/json.js";
import { generateHighlights } from "../src/lib/replay/generateHighlights.js";
import type { ReplayMoment } from "../src/lib/replay/detectMoments.js";
import type { MatchSummary, TournamentConfig } from "../src/tournament/types.js";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";

const matchSummary: MatchSummary = {
  matchId: "match-1",
  matchKey: "match-1",
  seed: 1,
  agentIds: ["alpha", "bravo"],
  scores: { alpha: 12, bravo: 9 },
  winner: "alpha",
  turns: 10,
  reason: "completed",
};

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 101,
    maxTurns: 20,
    rounds: 2,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

describe("generateHighlights", () => {
  it("orders highlights by priority and renders headlines", () => {
    const moments: ReplayMoment[] = [
      {
        id: "moment-score-swing-1-2-alpha",
        label: "Score swing",
        type: "score_swing",
        startSeq: 1,
        endSeq: 2,
        signals: { agentId: "alpha", delta: 12 },
        description: "Alpha swings the score.",
      },
      {
        id: "moment-lead-change-2-3-bravo",
        label: "Lead change",
        type: "lead_change",
        startSeq: 2,
        endSeq: 3,
        signals: { newLeader: "bravo", lead: 4 },
        description: "Bravo takes the lead.",
      },
      {
        id: "moment-blunder-4-alpha",
        label: "Blunder",
        type: "blunder",
        startSeq: 4,
        endSeq: 4,
        signals: { agentId: "alpha" },
        description: "Alpha blunders.",
      },
    ];

    const highlights = generateHighlights(moments, matchSummary);
    expect(highlights).not.toBeNull();
    expect(highlights?.highlights.map((highlight) => highlight.momentRef)).toEqual([
      "moment-lead-change-2-3-bravo",
      "moment-score-swing-1-2-alpha",
      "moment-blunder-4-alpha",
    ]);
    expect(highlights?.highlights[0].headline).toBe("Lead change! bravo takes control");
    expect(highlights?.highlights[1].headline).toBe("alpha surges with a 12-point swing");
    expect(highlights?.highlights[2].headline).toBe("alpha stumbles with an invalid move");
  });

  it("tags comebacks as spoilers", () => {
    const moments: ReplayMoment[] = [
      {
        id: "moment-comeback-5-10-alpha",
        label: "Comeback",
        type: "comeback",
        startSeq: 5,
        endSeq: 10,
        signals: { winner: "alpha", deficit: 8 },
      },
    ];

    const highlights = generateHighlights(moments, matchSummary);
    expect(highlights?.highlights[0].spoilerLevel).toBe("reveals_outcome");
  });

  it("returns null for empty input", () => {
    expect(generateHighlights([], matchSummary)).toBeNull();
  });

  it("falls back when signal keys are missing", () => {
    const moments: ReplayMoment[] = [
      {
        id: "moment-score-swing-1-2-unknown",
        label: "Score swing",
        type: "score_swing",
        startSeq: 1,
        endSeq: 2,
        signals: {},
      },
    ];

    const highlights = generateHighlights(moments, matchSummary);
    expect(highlights?.highlights[0].headline).toBe("Dramatic score swing");
  });

  it("is deterministic for identical input", () => {
    const moments: ReplayMoment[] = [
      {
        id: "moment-lead-change-2-3-bravo",
        label: "Lead change",
        type: "lead_change",
        startSeq: 2,
        endSeq: 3,
        signals: { newLeader: "bravo", lead: 4 },
      },
    ];

    const first = generateHighlights(moments, matchSummary);
    const second = generateHighlights(moments, matchSummary);

    expect(stableStringify(first)).toBe(stableStringify(second));
  });

  it("writes highlights alongside moments in tournament artifacts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashmatch-highlights-"));

    try {
      const result = runTournament(makeConfig());
      await writeTournamentArtifacts(result, dir);

      for (const summary of result.matchSummaries) {
        const matchDir = join(dir, "matches", summary.matchKey);
        const momentsPath = join(matchDir, "moments.json");
        const highlightsPath = join(matchDir, "highlights.json");

        if (existsSync(momentsPath)) {
          expect(existsSync(highlightsPath)).toBe(true);
          const raw = readFileSync(highlightsPath, "utf-8");
          expect(raw.endsWith("\n")).toBe(true);
          expect(raw.endsWith("\n\n")).toBe(false);
        } else {
          expect(existsSync(highlightsPath)).toBe(false);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
