import { describe, expect, it } from "vitest";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";
import { runTournament } from "../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../src/tournament/artifacts.js";
import { runSignTournamentCli } from "../src/cli/sign-tournament.js";
import { runVerifyReceiptCli, verifyReceiptDirectory } from "../src/cli/verify-receipt.js";
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
  const dir = mkdtempSync(join(tmpdir(), "hashmatch-verify-receipt-"));
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

async function setupSignedTournament() {
  const { dir, result } = await setupTournamentDir();
  const keyDir = mkdtempSync(join(tmpdir(), "hashmatch-keys-"));
  const { privateKey, publicKey } = generateKeyPair();
  const privateKeyPath = join(keyDir, "organizer.key");
  const publicKeyPath = join(keyDir, "organizer.pub");
  writeFileSync(privateKeyPath, privateKey, "utf-8");
  writeFileSync(publicKeyPath, publicKey, "utf-8");
  const exitCode = await runSignTournamentCli([
    dir,
    "--key",
    privateKeyPath,
    "--issuer",
    "unit-test",
  ]);
  expect(exitCode).toBe(0);

  return { dir, result, keyDir, publicKeyPath };
}

describe("verify-receipt", () => {
  it("verifies a signed tournament with the correct public key", async () => {
    const { dir, result, keyDir, publicKeyPath } = await setupSignedTournament();
    try {
      const exitCode = await runVerifyReceiptCli([dir, "--pub", publicKeyPath]);
      expect(exitCode).toBe(0);

      const report = await verifyReceiptDirectory(dir, {
        publicKeyPem: readFileSync(publicKeyPath, "utf-8"),
      });
      expect(report.status).toBe("pass");
      expect(report.matchResults).toHaveLength(result.matchSummaries.length);
      expect(report.tournamentReceipt?.status).toBe("pass");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });

  it("fails when the public key does not match the receipts", async () => {
    const { dir, keyDir } = await setupSignedTournament();
    const altKeyDir = mkdtempSync(join(tmpdir(), "hashmatch-keys-alt-"));
    try {
      const { publicKey } = generateKeyPair();
      const altPublicKeyPath = join(altKeyDir, "alt.pub");
      writeFileSync(altPublicKeyPath, publicKey, "utf-8");

      const report = await verifyReceiptDirectory(dir, {
        publicKeyPem: readFileSync(altPublicKeyPath, "utf-8"),
      });
      expect(report.status).toBe("fail");
      expect(report.errors.some((error) => error.includes("provided public key"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
      rmSync(altKeyDir, { recursive: true, force: true });
    }
  });

  it("fails when a match log hash is tampered", async () => {
    const { dir, result, keyDir, publicKeyPath } = await setupSignedTournament();
    try {
      const firstMatch = result.matchSummaries[0];
      const matchLogPath = join(dir, "matches", firstMatch.matchKey, "match.jsonl");
      appendFileSync(matchLogPath, "tamper");

      const report = await verifyReceiptDirectory(dir, {
        publicKeyPem: readFileSync(publicKeyPath, "utf-8"),
      });
      expect(report.status).toBe("fail");
      const matchResult = report.matchResults.find((entry) =>
        entry.matchDir.endsWith(`/${firstMatch.matchKey}`),
      );
      expect(matchResult?.logHash?.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });

  it("fails when a match receipt is missing", async () => {
    const { dir, result, keyDir, publicKeyPath } = await setupSignedTournament();
    try {
      const firstMatch = result.matchSummaries[0];
      const receiptPath = join(dir, "matches", firstMatch.matchKey, "receipt.json");
      unlinkSync(receiptPath);

      const report = await verifyReceiptDirectory(dir, {
        publicKeyPem: readFileSync(publicKeyPath, "utf-8"),
      });
      expect(report.status).toBe("fail");
      expect(report.errors.some((error) => error.includes("receipt.json missing"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });

  it("skips hash recomputation when --skip-hashes is set", async () => {
    const { dir, result, keyDir, publicKeyPath } = await setupSignedTournament();
    try {
      const firstMatch = result.matchSummaries[0];
      const matchLogPath = join(dir, "matches", firstMatch.matchKey, "match.jsonl");
      appendFileSync(matchLogPath, "tamper");

      const report = await verifyReceiptDirectory(dir, {
        publicKeyPem: readFileSync(publicKeyPath, "utf-8"),
        skipHashes: true,
      });
      expect(report.status).toBe("pass");
      const matchResult = report.matchResults.find((entry) =>
        entry.matchDir.endsWith(`/${firstMatch.matchKey}`),
      );
      expect(matchResult?.logHash).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });

  it("checks only a single match when --match is provided", async () => {
    const { dir, result, keyDir, publicKeyPath } = await setupSignedTournament();
    try {
      const firstMatch = result.matchSummaries[0];
      const report = await verifyReceiptDirectory(dir, {
        publicKeyPem: readFileSync(publicKeyPath, "utf-8"),
        matchId: firstMatch.matchKey,
      });
      expect(report.status).toBe("pass");
      expect(report.matchResults).toHaveLength(1);
      expect(report.matchResults[0].matchDir.endsWith(`/${firstMatch.matchKey}`)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });
});
