import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import { runSignTournamentCli } from "../src/cli/sign-tournament.js";
import {
  verifyReceipt,
  type Receipt,
  type MatchReceiptPayload,
  type TournamentReceiptPayload,
} from "../src/core/receipt.js";
import { hashFile } from "../src/core/hash.js";
import type { TournamentConfig } from "../src/tournament/types.js";

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    seed: 3010,
    maxTurns: 10,
    rounds: 1,
    scenarioKey: "numberGuess",
    agentKeys: ["random", "baseline"],
    includeEventLogs: true,
    ...overrides,
  };
}

async function setupTournamentDir() {
  const dir = mkdtempSync(join(tmpdir(), "hashmatch-sign-tour-"));
  const result = await runTournament(makeConfig());
  await writeTournamentArtifacts(result, dir);
  return { dir, result };
}

function generateKeyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { format: "pem", type: "spki" },
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
  });
}

function readReceipt(path: string): Receipt<MatchReceiptPayload> {
  return JSON.parse(readFileSync(path, "utf-8")) as Receipt<MatchReceiptPayload>;
}

describe("sign-tournament", () => {
  it("writes and verifies receipts for matches and tournaments", async () => {
    const { dir, result } = await setupTournamentDir();
    const keyDir = mkdtempSync(join(tmpdir(), "hashmatch-keys-"));
    try {
      const { privateKey } = generateKeyPair();
      const privateKeyPath = join(keyDir, "organizer.key");
      writeFileSync(privateKeyPath, privateKey, "utf-8");

      const exitCode = await runSignTournamentCli([
        dir,
        "--key",
        privateKeyPath,
        "--issuer",
        "unit-test",
      ]);
      expect(exitCode).toBe(0);

      for (const summary of result.matchSummaries) {
        const receiptPath = join(dir, "matches", summary.matchKey, "receipt.json");
        const receipt = readReceipt(receiptPath);
        expect(verifyReceipt(receipt)).toBe(true);
      }

      const tournamentReceiptPath = join(dir, "tournament_receipt.json");
      const tournamentReceipt = JSON.parse(
        readFileSync(tournamentReceiptPath, "utf-8"),
      ) as Receipt<TournamentReceiptPayload>;
      expect(verifyReceipt(tournamentReceipt)).toBe(true);

      const firstMatch = result.matchSummaries[0];
      const matchLogPath = join(dir, "matches", firstMatch.matchKey, "match.jsonl");
      const receiptPath = join(dir, "matches", firstMatch.matchKey, "receipt.json");
      const receipt = readReceipt(receiptPath);

      appendFileSync(matchLogPath, "tamper");
      const updatedLogHash = await hashFile(matchLogPath);
      expect(updatedLogHash).not.toBe(receipt.payload.logHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });
});
