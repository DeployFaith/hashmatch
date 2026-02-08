import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, hashManifestCore, sha256Hex } from "../core/hash.js";
import {
  canonicalizePayload,
  verifyReceipt,
  type MatchReceiptPayload,
  type Receipt,
  type TournamentReceiptPayload,
} from "../core/receipt.js";

export type VerifyReceiptStatus = "pass" | "fail";

export interface VerifyReceiptHashStatus {
  expected: string;
  actual: string;
  ok: boolean;
}

export interface VerifyReceiptSignatureStatus {
  ok: boolean;
  errors: string[];
}

export interface VerifyReceiptMatchResult {
  matchId: string;
  matchDir: string;
  receiptPath: string;
  status: VerifyReceiptStatus;
  signature?: VerifyReceiptSignatureStatus;
  logHash?: VerifyReceiptHashStatus;
  manifestHash?: VerifyReceiptHashStatus;
  errors: string[];
}

export interface VerifyReceiptTournamentResult {
  receiptPath: string;
  status: VerifyReceiptStatus;
  signature?: VerifyReceiptSignatureStatus;
  truthBundleHash?: VerifyReceiptHashStatus;
  matchCount?: { expected: number; actual: number; ok: boolean };
  errors: string[];
}

export interface VerifyReceiptReport {
  tournamentDir: string;
  matchResults: VerifyReceiptMatchResult[];
  tournamentReceipt?: VerifyReceiptTournamentResult;
  status: VerifyReceiptStatus;
  errors: string[];
}

interface VerifyReceiptOptions {
  matchId?: string;
  skipHashes?: boolean;
  publicKeyPem: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function parseMatchReceiptPayload(value: unknown): {
  payload?: MatchReceiptPayload;
  errors: string[];
} {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["match receipt payload must be an object"] };
  }
  if (typeof value.matchId !== "string") {
    errors.push("match receipt payload missing matchId");
  }
  if (typeof value.logHash !== "string") {
    errors.push("match receipt payload missing logHash");
  }
  if (typeof value.manifestHash !== "string") {
    errors.push("match receipt payload missing manifestHash");
  }
  if (typeof value.runnerVersion !== "string") {
    errors.push("match receipt payload missing runnerVersion");
  }
  if (typeof value.issuedBy !== "string") {
    errors.push("match receipt payload missing issuedBy");
  }
  if (errors.length > 0) {
    return { errors };
  }
  return { payload: value as unknown as MatchReceiptPayload, errors };
}

function parseTournamentReceiptPayload(value: unknown): {
  payload?: TournamentReceiptPayload;
  errors: string[];
} {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["tournament receipt payload must be an object"] };
  }
  if (typeof value.tournamentId !== "string") {
    errors.push("tournament receipt payload missing tournamentId");
  }
  if (typeof value.truthBundleHash !== "string") {
    errors.push("tournament receipt payload missing truthBundleHash");
  }
  if (typeof value.matchCount !== "number") {
    errors.push("tournament receipt payload missing matchCount");
  }
  if (typeof value.issuedBy !== "string") {
    errors.push("tournament receipt payload missing issuedBy");
  }
  if (errors.length > 0) {
    return { errors };
  }
  return { payload: value as unknown as TournamentReceiptPayload, errors };
}

function parseReceipt<T>(
  raw: string,
  payloadParser: (value: unknown) => { payload?: T; errors: string[] },
): { receipt?: Receipt<T>; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    return { errors: [err instanceof Error ? err.message : String(err)] };
  }

  if (!isRecord(parsed)) {
    return { errors: ["receipt.json must be a JSON object"] };
  }
  const errors: string[] = [];
  if (parsed.version !== 1) {
    errors.push("receipt version must be 1");
  }
  if (parsed.algorithm !== "ed25519") {
    errors.push("receipt algorithm must be ed25519");
  }
  if (!isRecord(parsed.payload)) {
    errors.push("receipt payload must be an object");
  }
  if (typeof parsed.signature !== "string") {
    errors.push("receipt signature must be a string");
  }
  if (typeof parsed.publicKey !== "string") {
    errors.push("receipt publicKey must be a string");
  }
  if (parsed.signedAt !== undefined && typeof parsed.signedAt !== "string") {
    errors.push("receipt signedAt must be a string when provided");
  }
  if (errors.length > 0) {
    return { errors };
  }

  const payloadResult = payloadParser(parsed.payload);
  if (payloadResult.errors.length > 0 || !payloadResult.payload) {
    return { errors: payloadResult.errors };
  }

  const signature = parsed.signature as string;
  const publicKey = parsed.publicKey as string;
  const signedAt = parsed.signedAt as string | undefined;
  const receipt = {
    version: 1,
    algorithm: "ed25519",
    payload: payloadResult.payload,
    signature,
    publicKey,
    signedAt,
  } satisfies Receipt<T>;

  return { receipt, errors: [] };
}

function verifyReceiptWithPublicKey<T>(receipt: Receipt<T>, publicKeyDer: Buffer): boolean {
  const bytes = canonicalizePayload(receipt.payload);
  const signature = Buffer.from(receipt.signature, "hex");
  return verify(
    null,
    bytes,
    {
      key: publicKeyDer,
      format: "der",
      type: "spki",
    },
    signature,
  );
}

function verifyReceiptSignature<T>(
  receipt: Receipt<T>,
  publicKeyDer: Buffer,
  expectedPublicKeyHex: string,
): VerifyReceiptSignatureStatus {
  const errors: string[] = [];
  if (!verifyReceipt(receipt)) {
    errors.push("receipt signature does not match receipt publicKey");
  }
  if (receipt.publicKey !== expectedPublicKeyHex) {
    errors.push("receipt publicKey does not match provided public key");
  }
  if (!verifyReceiptWithPublicKey(receipt, publicKeyDer)) {
    errors.push("receipt signature does not match provided public key");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

async function listMatchDirectories(matchesDir: string): Promise<string[]> {
  const entries = await readdir(matchesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function formatSummary(report: VerifyReceiptReport): string {
  const lines: string[] = [];
  lines.push(`verify-receipt: ${report.tournamentDir}`);
  lines.push(`Status: ${report.status.toUpperCase()}`);

  const totalMatches = report.matchResults.length;
  const passedMatches = report.matchResults.filter((result) => result.status === "pass").length;
  const failedMatches = totalMatches - passedMatches;
  lines.push(`Matches: ${totalMatches} (✓ ${passedMatches} passed, ✗ ${failedMatches} failed)`);

  if (report.tournamentReceipt) {
    const label = report.tournamentReceipt.status === "pass" ? "PASS" : "FAIL";
    lines.push(`Tournament receipt: ${label}`);
  }

  lines.push(`Errors: ${report.errors.length}`);
  if (report.errors.length > 0) {
    for (const error of report.errors) {
      lines.push(`  - ${error}`);
    }
  }
  return lines.join("\n");
}

export async function verifyReceiptDirectory(
  tournamentDir: string,
  options: VerifyReceiptOptions,
): Promise<VerifyReceiptReport> {
  const resolvedDir = resolve(tournamentDir);
  const errors: string[] = [];
  const matchResults: VerifyReceiptMatchResult[] = [];

  const tournamentStats = await stat(resolvedDir).catch(() => null);
  if (!tournamentStats || !tournamentStats.isDirectory()) {
    return {
      tournamentDir: resolvedDir,
      matchResults,
      status: "fail",
      errors: ["tournament directory does not exist"],
    };
  }

  const matchesDir = join(resolvedDir, "matches");
  if (!(await dirExists(matchesDir))) {
    return {
      tournamentDir: resolvedDir,
      matchResults,
      status: "fail",
      errors: ["matches directory does not exist"],
    };
  }

  const matchDirs = await listMatchDirectories(matchesDir);
  if (options.matchId && !matchDirs.includes(options.matchId)) {
    return {
      tournamentDir: resolvedDir,
      matchResults,
      status: "fail",
      errors: [`match ${options.matchId} not found in matches/`],
    };
  }

  let publicKeyDer: Buffer;
  let publicKeyHex: string;
  try {
    publicKeyDer = createPublicKey(options.publicKeyPem).export({
      format: "der",
      type: "spki",
    }) as Buffer;
    publicKeyHex = publicKeyDer.toString("hex");
  } catch (err: unknown) {
    return {
      tournamentDir: resolvedDir,
      matchResults,
      status: "fail",
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const matchDirsToVerify = options.matchId ? [options.matchId] : matchDirs;
  for (const matchDirName of matchDirsToVerify) {
    const matchDir = join(matchesDir, matchDirName);
    const receiptPath = join(matchDir, "receipt.json");
    const resultErrors: string[] = [];

    if (!(await fileExists(receiptPath))) {
      resultErrors.push("receipt.json missing");
      matchResults.push({
        matchId: matchDirName,
        matchDir,
        receiptPath,
        status: "fail",
        errors: resultErrors,
      });
      errors.push(`matches/${matchDirName}: receipt.json missing`);
      continue;
    }

    const receiptRaw = await readFile(receiptPath, "utf-8");
    const parsedReceipt = parseReceipt(receiptRaw, parseMatchReceiptPayload);
    if (!parsedReceipt.receipt) {
      resultErrors.push(...parsedReceipt.errors);
      matchResults.push({
        matchId: matchDirName,
        matchDir,
        receiptPath,
        status: "fail",
        errors: resultErrors,
      });
      for (const error of parsedReceipt.errors) {
        errors.push(`matches/${matchDirName}: ${error}`);
      }
      continue;
    }

    const receipt = parsedReceipt.receipt;
    const signature = verifyReceiptSignature(receipt, publicKeyDer, publicKeyHex);
    if (!signature.ok) {
      resultErrors.push(...signature.errors);
      for (const error of signature.errors) {
        errors.push(`matches/${matchDirName}: ${error}`);
      }
    }

    let logHash: VerifyReceiptHashStatus | undefined;
    let manifestHash: VerifyReceiptHashStatus | undefined;
    if (!options.skipHashes) {
      const logPath = join(matchDir, "match.jsonl");
      const manifestPath = join(matchDir, "match_manifest.json");
      let missingFiles = false;
      if (!(await fileExists(logPath))) {
        const message = "match.jsonl missing";
        resultErrors.push(message);
        errors.push(`matches/${matchDirName}: ${message}`);
        missingFiles = true;
      }
      if (!(await fileExists(manifestPath))) {
        const message = "match_manifest.json missing";
        resultErrors.push(message);
        errors.push(`matches/${matchDirName}: ${message}`);
        missingFiles = true;
      }

      if (!missingFiles) {
        const actualLogHash = await hashFile(logPath);
        const manifestRaw = await readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
        const actualManifestHash = hashManifestCore(manifest);
        logHash = {
          expected: receipt.payload.logHash,
          actual: actualLogHash,
          ok: receipt.payload.logHash === actualLogHash,
        };
        manifestHash = {
          expected: receipt.payload.manifestHash,
          actual: actualManifestHash,
          ok: receipt.payload.manifestHash === actualManifestHash,
        };

        if (!logHash.ok) {
          const message = "logHash mismatch";
          resultErrors.push(message);
          errors.push(`matches/${matchDirName}: ${message}`);
        }
        if (!manifestHash.ok) {
          const message = "manifestHash mismatch";
          resultErrors.push(message);
          errors.push(`matches/${matchDirName}: ${message}`);
        }
      }
    }

    matchResults.push({
      matchId: receipt.payload.matchId,
      matchDir,
      receiptPath,
      status: resultErrors.length === 0 ? "pass" : "fail",
      signature,
      logHash,
      manifestHash,
      errors: resultErrors,
    });
  }

  const tournamentReceiptPath = join(resolvedDir, "tournament_receipt.json");
  let tournamentReceipt: VerifyReceiptTournamentResult | undefined;
  if (!(await fileExists(tournamentReceiptPath))) {
    errors.push("tournament_receipt.json missing");
  } else {
    const receiptRaw = await readFile(tournamentReceiptPath, "utf-8");
    const parsedReceipt = parseReceipt(receiptRaw, parseTournamentReceiptPayload);
    const receiptErrors: string[] = [];
    if (!parsedReceipt.receipt) {
      receiptErrors.push(...parsedReceipt.errors);
      errors.push(...parsedReceipt.errors.map((error) => `tournament receipt: ${error}`));
    } else {
      const receipt = parsedReceipt.receipt;
      const signature = verifyReceiptSignature(receipt, publicKeyDer, publicKeyHex);
      if (!signature.ok) {
        receiptErrors.push(...signature.errors);
        errors.push(...signature.errors.map((error) => `tournament receipt: ${error}`));
      }

      let truthBundleHash: VerifyReceiptHashStatus | undefined;
      if (!options.skipHashes) {
        try {
          const logHashes = await Promise.all(
            matchDirs.map(async (matchDirName) => {
              const logPath = join(matchesDir, matchDirName, "match.jsonl");
              return hashFile(logPath);
            }),
          );
          const actualTruthBundleHash = sha256Hex(Buffer.from(logHashes.sort().join(""), "utf-8"));
          truthBundleHash = {
            expected: receipt.payload.truthBundleHash,
            actual: actualTruthBundleHash,
            ok: receipt.payload.truthBundleHash === actualTruthBundleHash,
          };
          if (!truthBundleHash.ok) {
            receiptErrors.push("truthBundleHash mismatch");
            errors.push("tournament receipt: truthBundleHash mismatch");
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          receiptErrors.push(message);
          errors.push(`tournament receipt: ${message}`);
        }
      }

      const matchCountStatus = {
        expected: receipt.payload.matchCount,
        actual: matchDirs.length,
        ok: receipt.payload.matchCount === matchDirs.length,
      };
      if (!matchCountStatus.ok) {
        receiptErrors.push("matchCount mismatch");
        errors.push("tournament receipt: matchCount mismatch");
      }

      tournamentReceipt = {
        receiptPath: tournamentReceiptPath,
        status: receiptErrors.length === 0 ? "pass" : "fail",
        signature,
        truthBundleHash,
        matchCount: matchCountStatus,
        errors: receiptErrors,
      };
    }
  }

  if (!tournamentReceipt && (await fileExists(tournamentReceiptPath))) {
    tournamentReceipt = {
      receiptPath: tournamentReceiptPath,
      status: "fail",
      errors: ["tournament receipt invalid"],
    };
  }

  const status = errors.length === 0 ? "pass" : "fail";
  return {
    tournamentDir: resolvedDir,
    matchResults,
    tournamentReceipt,
    status,
    errors,
  };
}

interface CliArgs {
  tournamentDir?: string;
  publicKeyPath?: string;
  matchId?: string;
  skipHashes?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let tournamentDir: string | undefined;
  let publicKeyPath: string | undefined;
  let matchId: string | undefined;
  let skipHashes = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pub" && i + 1 < argv.length) {
      publicKeyPath = argv[++i];
    } else if (arg === "--match" && i + 1 < argv.length) {
      matchId = argv[++i];
    } else if (arg === "--skip-hashes") {
      skipHashes = true;
    } else if (!arg.startsWith("--") && !tournamentDir) {
      tournamentDir = arg;
    }
  }

  return { tournamentDir, publicKeyPath, matchId, skipHashes };
}

export async function runVerifyReceiptCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.tournamentDir) {
    // eslint-disable-next-line no-console
    console.error("Error: <tournament-dir> is required");
    return 1;
  }
  if (!args.publicKeyPath) {
    // eslint-disable-next-line no-console
    console.error("Error: --pub <path-to-public-key> is required");
    return 1;
  }

  const publicKeyPem = await readFile(resolve(args.publicKeyPath), "utf-8");
  const report = await verifyReceiptDirectory(args.tournamentDir, {
    matchId: args.matchId,
    skipHashes: args.skipHashes,
    publicKeyPem,
  });
  const jsonOutput = JSON.stringify(report);
  process.stdout.write(`${jsonOutput}\n`);
  process.stdout.write(`${formatSummary(report)}\n`);

  return report.status === "pass" ? 0 : 1;
}

async function main(): Promise<void> {
  const exitCode = await runVerifyReceiptCli(process.argv.slice(2));
  process.exit(exitCode);
}

const self = fileURLToPath(import.meta.url);
const entry = resolve(process.argv[1] ?? "");
if (self === entry) {
  void main();
}
