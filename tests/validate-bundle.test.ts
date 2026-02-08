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
import type { TournamentConfig } from "../src/tournament/types.js";
import { validateBundle } from "../src/core/bundleValidator.js";
import { runSignTournamentCli } from "../src/cli/sign-tournament.js";

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

async function createTournamentDir(): Promise<{ dir: string; matchKey: string }> {
  const dir = mkdtempSync(join(tmpdir(), "hashmatch-validate-"));
  const result = await runTournament(makeConfig());
  await writeTournamentArtifacts(result, dir);
  return { dir, matchKey: result.matchSummaries[0].matchKey };
}

function generateKeyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { format: "pem", type: "spki" },
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
  });
}

async function setupSignedTournament(): Promise<{
  dir: string;
  matchKey: string;
  keyDir: string;
}> {
  const { dir, matchKey } = await createTournamentDir();
  const keyDir = mkdtempSync(join(tmpdir(), "hashmatch-validate-keys-"));
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
  return { dir, matchKey, keyDir };
}

describe("validate-bundle", () => {
  it("valid bundle passes all checks", async () => {
    const { dir } = await createTournamentDir();

    try {
      const report = await validateBundle(dir);
      expect(report.exitCode).toBe(0);
      expect(report.checks.structure.status).toBe("pass");
      expect(report.checks.crossReferences.status).toBe("pass");
      expect(report.checks.contentHashes.status).toBe("pass");
      expect(report.checks.tournamentHash.status).toBe("pass");
      expect(report.checks.standings.status).toBe("pass");
      expect(report.checks.broadcastManifest.status).toBe("pass");
      expect(report.checks.signatures.status).toBe("warn");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tampered match.jsonl fails hash check", async () => {
    const { dir, matchKey } = await createTournamentDir();
    const matchJsonlPath = join(dir, "matches", matchKey, "match.jsonl");

    try {
      appendFileSync(matchJsonlPath, "x", "utf-8");
      const report = await validateBundle(dir);
      expect(report.checks.contentHashes.status).toBe("fail");
      expect(report.checks.contentHashes.errors.join(" ")).toContain(
        `HASH MISMATCH: matches/${matchKey}/match.jsonl`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("missing required file fails structure check", async () => {
    const { dir, matchKey } = await createTournamentDir();
    const manifestPath = join(dir, "matches", matchKey, "match_manifest.json");

    try {
      unlinkSync(manifestPath);
      const report = await validateBundle(dir);
      expect(report.checks.structure.status).toBe("error");
      expect(report.checks.structure.errors.join(" ")).toContain(
        `MISSING: matches/${matchKey}/match_manifest.json`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tampered standings fails consistency check", async () => {
    const { dir } = await createTournamentDir();
    const standingsPath = join(dir, "standings.json");

    try {
      const standings = JSON.parse(readFileSync(standingsPath, "utf-8")) as Array<{
        agentId: string;
        points: number;
      }>;
      standings[0].points += 1;
      writeFileSync(standingsPath, `${JSON.stringify(standings, null, 2)}\n`, "utf-8");

      const report = await validateBundle(dir);
      expect(report.checks.standings.status).toBe("fail");
      expect(report.checks.standings.errors.join(" ")).toContain("points expected");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("signed receipts validate and tampering fails", async () => {
    const { dir, matchKey, keyDir } = await setupSignedTournament();

    try {
      const report = await validateBundle(dir);
      expect(report.checks.signatures.status).toBe("pass");

      const receiptPath = join(dir, "matches", matchKey, "receipt.json");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf-8")) as {
        payload: { logHash: string };
      };
      receipt.payload.logHash = "sha256:deadbeef";
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf-8");

      const tampered = await validateBundle(dir);
      expect(tampered.checks.signatures.status).toBe("fail");
      expect(tampered.checks.signatures.errors.join(" ")).toContain(
        `SIGNATURE INVALID: matches/${matchKey}/receipt.json`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(keyDir, { recursive: true, force: true });
    }
  });

  it("require-signatures fails when receipts are missing", async () => {
    const { dir, matchKey } = await createTournamentDir();

    try {
      const report = await validateBundle(dir, { requireSignatures: true });
      expect(report.checks.signatures.status).toBe("fail");
      expect(report.checks.signatures.errors.join(" ")).toContain(
        `MISSING: matches/${matchKey}/receipt.json`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
