import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts, writeTournamentBundle } from "../src/tournament/artifacts.js";
import { parseJsonl } from "../src/lib/replay/parseJsonl.js";
import type { TournamentConfig } from "../src/tournament/types.js";
import type { TournamentBundleV1 } from "../src/lib/replay/bundle.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 7,
    maxTurns: 12,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

describe("Tournament bundle output", () => {
  it("parses bundled JSONL logs with sorted events", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-league-bundle-"));
    const artifactsDir = join(dir, "artifacts");
    const bundlePath = join(dir, "bundle.json");

    try {
      const result = runTournament(makeConfig());
      await writeTournamentArtifacts(result, artifactsDir);
      writeTournamentBundle(result, bundlePath);

      const raw = readFileSync(bundlePath, "utf-8");
      const bundle = JSON.parse(raw) as TournamentBundleV1;

      for (const match of bundle.matches) {
        const { events, errors } = parseJsonl(match.jsonl);
        expect(errors).toEqual([]);
        for (let i = 1; i < events.length; i++) {
          expect(events[i].seq).toBeGreaterThanOrEqual(events[i - 1].seq);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
