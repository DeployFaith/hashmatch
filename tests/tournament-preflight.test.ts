import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import type { TournamentConfig } from "../src/tournament/types.js";
import { runSignTournamentCli } from "../src/cli/sign-tournament.js";
import { validateBundle } from "../src/core/bundleValidator.js";
import * as preflightModule from "../src/agents/llm/preflight.js";
import { createMatchIdFromSeed } from "../src/engine/matchId.js";
import * as runMatchModule from "../src/engine/runMatch.js";

describe("tournament preflight failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes with setupFailed matches and produces a valid signed bundle", async () => {
    const preflightSpy = vi.spyOn(preflightModule, "preflightValidateLlmAgents");
    preflightSpy.mockRejectedValueOnce(
      new preflightModule.LlmPreflightError("LLM preflight validation failed.", [
        "mocked failure",
      ]),
    );
    preflightSpy.mockResolvedValue(undefined);

    const runMatchSpy = vi.spyOn(runMatchModule, "runMatch");
    runMatchSpy.mockImplementation(async (scenario, agents, config) => {
      const matchId = createMatchIdFromSeed(config.seed);
      const scores = {
        [agents[0].id]: 1,
        [agents[1].id]: 0,
      };
      const timeoutsPerAgent = {
        [agents[0].id]: 0,
        [agents[1].id]: 0,
      };
      return {
        matchId,
        seed: config.seed,
        scores,
        events: [
          {
            type: "MatchEnded",
            seq: 0,
            matchId,
            reason: "completed",
            scores,
            turns: 1,
          },
        ],
        turns: 1,
        maxTurnTimeMs: 30000,
        timeoutsPerAgent,
      };
    });

    const config: TournamentConfig = {
      seed: 1337,
      maxTurns: 3,
      rounds: 2,
      scenarioKey: "numberGuess",
      agentKeys: ["llm:openrouter:gpt-4o-mini", "noop"],
      includeEventLogs: true,
    };

    const tournamentDir = mkdtempSync(join(tmpdir(), "hashmatch-preflight-tournament-"));
    const keyDir = mkdtempSync(join(tmpdir(), "hashmatch-preflight-keys-"));

    try {
      const result = await runTournament(config);
      expect(result.matchSummaries).toHaveLength(2);
      const failed = result.matchSummaries.find((summary) => summary.reason === "setupFailed");
      const completed = result.matchSummaries.find((summary) => summary.reason !== "setupFailed");
      expect(failed).toBeDefined();
      expect(completed).toBeDefined();
      expect(failed?.error).toContain("LLM preflight validation failed.");
      expect(result.matchLogs).toBeDefined();
      expect(runMatchSpy).toHaveBeenCalledTimes(1);

      await writeTournamentArtifacts(result, tournamentDir);

      const { privateKey } = generateKeyPairSync("ed25519", {
        publicKeyEncoding: { format: "pem", type: "spki" },
        privateKeyEncoding: { format: "pem", type: "pkcs8" },
      });
      const privateKeyPath = join(keyDir, "tournament.key");
      writeFileSync(privateKeyPath, privateKey, "utf-8");

      const exitCode = await runSignTournamentCli([
        tournamentDir,
        "--key",
        privateKeyPath,
        "--issuer",
        "unit-test",
      ]);
      expect(exitCode).toBe(0);

      const report = await validateBundle(tournamentDir, { requireSignatures: true });
      expect(report.exitCode).toBe(0);
      expect(report.checks.signatures.status).toBe("pass");
    } finally {
      rmSync(tournamentDir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });
});
