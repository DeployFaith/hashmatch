import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stableStringify } from "../core/json.js";
import {
  signMatchReceipt,
  signTournamentReceipt,
  type MatchReceiptPayload,
  type TournamentReceiptPayload,
} from "../core/receipt.js";

interface CliArgs {
  tournamentDir?: string;
  keyPath?: string;
  issuer?: string;
}

function parseArgs(argv: string[]): CliArgs {
  let tournamentDir: string | undefined;
  let keyPath: string | undefined;
  let issuer: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--key" && i + 1 < argv.length) {
      keyPath = argv[++i];
    } else if (arg === "--issuer" && i + 1 < argv.length) {
      issuer = argv[++i];
    } else if (!arg.startsWith("--") && !tournamentDir) {
      tournamentDir = arg;
    }
  }

  return { tournamentDir, keyPath, issuer };
}

interface MatchManifestData {
  matchId: string;
  runner: { version: string | null };
}

interface MatchSummaryData {
  hashes: { logHash: string; manifestHash: string };
}

function parseMatchManifest(raw: string): MatchManifestData {
  const parsed = JSON.parse(raw) as {
    matchId?: unknown;
    runner?: { version?: unknown };
  };
  if (typeof parsed.matchId !== "string") {
    throw new Error("match_manifest.json missing matchId");
  }
  const runner = parsed.runner;
  if (!runner || (runner.version !== null && typeof runner.version !== "string")) {
    throw new Error("match_manifest.json runner.version missing or invalid");
  }

  return {
    matchId: parsed.matchId,
    runner: { version: runner.version ?? null },
  };
}

function parseMatchSummary(raw: string): MatchSummaryData {
  const parsed = JSON.parse(raw) as { hashes?: { logHash?: unknown; manifestHash?: unknown } };
  const hashes = parsed.hashes;
  if (!hashes) {
    throw new Error("match_summary.json missing hashes");
  }
  if (typeof hashes.logHash !== "string" || typeof hashes.manifestHash !== "string") {
    throw new Error("match_summary.json hashes missing logHash or manifestHash");
  }
  return { hashes: { logHash: hashes.logHash, manifestHash: hashes.manifestHash } };
}

interface TournamentManifestData {
  tournamentSeed: number;
  truthBundleHash: string;
}

function parseTournamentManifest(raw: string): TournamentManifestData {
  const parsed = JSON.parse(raw) as { tournamentSeed?: unknown; truthBundleHash?: unknown };
  if (typeof parsed.tournamentSeed !== "number") {
    throw new Error("tournament_manifest.json missing tournamentSeed");
  }
  if (typeof parsed.truthBundleHash !== "string") {
    throw new Error("tournament_manifest.json missing truthBundleHash");
  }
  return { tournamentSeed: parsed.tournamentSeed, truthBundleHash: parsed.truthBundleHash };
}

async function listMatchDirectories(matchesDir: string): Promise<string[]> {
  const entries = await readdir(matchesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function toRunnerVersion(version: string | null): string {
  return version ?? "unversioned";
}

function ensureTrailingNewline(value: string): string {
  return value.replace(/\n*$/, "\n");
}

export async function runSignTournamentCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.tournamentDir) {
    // eslint-disable-next-line no-console
    console.error("Error: <tournament-dir> is required");
    return 2;
  }
  if (!args.keyPath) {
    // eslint-disable-next-line no-console
    console.error("Error: --key <path-to-private-key> is required");
    return 2;
  }
  if (!args.issuer) {
    // eslint-disable-next-line no-console
    console.error("Error: --issuer <identity-string> is required");
    return 2;
  }

  const tournamentDir = resolve(args.tournamentDir);
  const matchesDir = join(tournamentDir, "matches");

  const stats = await stat(tournamentDir).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    // eslint-disable-next-line no-console
    console.error("Error: tournament directory does not exist");
    return 2;
  }

  const matchesStats = await stat(matchesDir).catch(() => null);
  if (!matchesStats || !matchesStats.isDirectory()) {
    // eslint-disable-next-line no-console
    console.error("Error: matches directory does not exist");
    return 2;
  }

  const privateKeyPem = await readFile(resolve(args.keyPath), "utf-8");
  const matchDirs = await listMatchDirectories(matchesDir);

  for (const matchDirName of matchDirs) {
    const matchDir = join(matchesDir, matchDirName);
    const manifestRaw = await readFile(join(matchDir, "match_manifest.json"), "utf-8");
    const summaryRaw = await readFile(join(matchDir, "match_summary.json"), "utf-8");
    const manifest = parseMatchManifest(manifestRaw);
    const summary = parseMatchSummary(summaryRaw);

    const payload: MatchReceiptPayload = {
      matchId: manifest.matchId,
      logHash: summary.hashes.logHash,
      manifestHash: summary.hashes.manifestHash,
      runnerVersion: toRunnerVersion(manifest.runner.version),
      issuedBy: args.issuer,
    };

    const receipt = signMatchReceipt(payload, privateKeyPem);
    const receiptJson = ensureTrailingNewline(stableStringify(receipt));
    await writeFile(join(matchDir, "receipt.json"), receiptJson, "utf-8");
  }

  const tournamentManifestRaw = await readFile(
    join(tournamentDir, "tournament_manifest.json"),
    "utf-8",
  );
  const tournamentManifest = parseTournamentManifest(tournamentManifestRaw);
  const tournamentPayload: TournamentReceiptPayload = {
    tournamentId: String(tournamentManifest.tournamentSeed),
    truthBundleHash: tournamentManifest.truthBundleHash,
    matchCount: matchDirs.length,
    issuedBy: args.issuer,
  };
  const tournamentReceipt = signTournamentReceipt(tournamentPayload, privateKeyPem);
  const tournamentReceiptJson = ensureTrailingNewline(stableStringify(tournamentReceipt));
  await writeFile(join(tournamentDir, "tournament_receipt.json"), tournamentReceiptJson, "utf-8");

  // eslint-disable-next-line no-console
  console.log(`Signed ${matchDirs.length} match receipts + 1 tournament receipt.`);

  return 0;
}

async function main(): Promise<void> {
  const exitCode = await runSignTournamentCli(process.argv.slice(2));
  process.exit(exitCode);
}

const self = fileURLToPath(import.meta.url);
const entry = resolve(process.argv[1] ?? "");
if (self === entry) {
  void main();
}
