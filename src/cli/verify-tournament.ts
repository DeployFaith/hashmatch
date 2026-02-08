import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../core/hash.js";
import {
  verifyMatchDirectory,
  type VerifyMatchReport,
  type VerifyMatchStatus,
} from "./verify-match.js";

const REQUIRED_FILES = ["tournament_manifest.json", "tournament.json"] as const;

export type VerifyTournamentStatus = "pass" | "fail" | "error";

export interface VerifyTournamentFileStatus {
  name: string;
  exists: boolean;
}

export interface VerifyTournamentDirStatus {
  name: string;
  exists: boolean;
  count?: number;
}

export interface VerifyTournamentAliasStatus {
  ok: boolean;
}

export interface VerifyTournamentHashStatus {
  expected: string;
  actual: string;
  ok: boolean;
}

export interface VerifyTournamentMatchSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  results: VerifyMatchReport[];
}

export interface VerifyTournamentReport {
  outDir: string;
  files: VerifyTournamentFileStatus[];
  matchesDir: VerifyTournamentDirStatus;
  aliasBytes?: VerifyTournamentAliasStatus;
  matchSummary?: VerifyTournamentMatchSummary;
  truthBundleHash?: VerifyTournamentHashStatus;
  status: VerifyTournamentStatus;
  exitCode: 0 | 1 | 2;
  errors: string[];
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

function parseMatchLogHash(raw: string): string {
  const parsed = JSON.parse(raw) as { hashes?: { logHash?: unknown } };
  const hashes = parsed.hashes;
  if (!hashes) {
    throw new Error("match_summary.json missing hashes field");
  }
  if (typeof hashes.logHash !== "string") {
    throw new Error("match_summary.json hashes must include logHash string");
  }
  return hashes.logHash;
}

function summarizeMatchResults(results: VerifyMatchReport[]): VerifyTournamentMatchSummary {
  const counts = results.reduce(
    (acc, result) => {
      acc.total += 1;
      if (result.status === "pass") {
        acc.passed += 1;
      } else if (result.status === "fail") {
        acc.failed += 1;
      } else {
        acc.errored += 1;
      }
      return acc;
    },
    { total: 0, passed: 0, failed: 0, errored: 0 },
  );

  return {
    ...counts,
    results,
  };
}

function shouldTreatMatchStatusAsError(status: VerifyMatchStatus): boolean {
  return status === "error";
}

export async function verifyTournamentDirectory(outDir: string): Promise<VerifyTournamentReport> {
  const files = await Promise.all(
    REQUIRED_FILES.map(async (name) => ({
      name,
      exists: await fileExists(join(outDir, name)),
    })),
  );

  const matchesDirPath = join(outDir, "matches");
  const matchesDirExists = await dirExists(matchesDirPath);
  const matchesDir: VerifyTournamentDirStatus = {
    name: "matches/",
    exists: matchesDirExists,
  };

  const missing: string[] = files.filter((file) => !file.exists).map((file) => file.name);
  if (!matchesDirExists) {
    missing.push("matches/");
  }

  if (missing.length > 0) {
    return {
      outDir,
      files,
      matchesDir,
      status: "error",
      exitCode: 2,
      errors: [`Missing required files or directories: ${missing.join(", ")}`],
    };
  }

  const errors: string[] = [];

  let aliasBytes: VerifyTournamentAliasStatus | undefined;
  try {
    const manifestBytes = await readFile(join(outDir, "tournament_manifest.json"));
    const legacyBytes = await readFile(join(outDir, "tournament.json"));
    aliasBytes = { ok: manifestBytes.equals(legacyBytes) };
  } catch (err: unknown) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  let matchResults: VerifyMatchReport[] = [];
  let matchSummary: VerifyTournamentMatchSummary | undefined;
  try {
    const entries = await readdir(matchesDirPath, { withFileTypes: true });
    const matchDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    matchesDir.count = matchDirs.length;
    matchResults = await Promise.all(
      matchDirs.map((matchDir) => verifyMatchDirectory(join(matchesDirPath, matchDir))),
    );
    matchSummary = summarizeMatchResults(matchResults);
  } catch (err: unknown) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  let truthBundleHash: VerifyTournamentHashStatus | undefined;
  if (errors.length === 0) {
    try {
      const manifestRaw = await readFile(join(outDir, "tournament_manifest.json"), "utf-8");
      const manifest = JSON.parse(manifestRaw) as { truthBundleHash?: unknown };
      if (typeof manifest.truthBundleHash !== "string") {
        throw new Error("tournament_manifest.json missing truthBundleHash");
      }

      const entries = await readdir(matchesDirPath, { withFileTypes: true });
      const matchDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      const logHashes: string[] = [];
      for (const matchDir of matchDirs) {
        const summaryRaw = await readFile(
          join(matchesDirPath, matchDir, "match_summary.json"),
          "utf-8",
        );
        logHashes.push(parseMatchLogHash(summaryRaw));
      }

      const actual = sha256Hex(Buffer.from(logHashes.sort().join(""), "utf-8"));
      truthBundleHash = {
        expected: manifest.truthBundleHash,
        actual,
        ok: manifest.truthBundleHash === actual,
      };
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const hasMatchErrors = matchResults.some((result) =>
    shouldTreatMatchStatusAsError(result.status),
  );
  const hasMatchFailures = matchResults.some((result) => result.status === "fail");
  const hasStructuralErrors = errors.length > 0 || hasMatchErrors;
  const hasMismatches =
    (aliasBytes ? !aliasBytes.ok : false) ||
    hasMatchFailures ||
    (truthBundleHash ? !truthBundleHash.ok : false);

  let status: VerifyTournamentStatus = "pass";
  let exitCode: 0 | 1 | 2 = 0;

  if (hasStructuralErrors) {
    status = "error";
    exitCode = 2;
  } else if (hasMismatches) {
    status = "fail";
    exitCode = 1;
  }

  if (matchResults.length > 0) {
    for (const result of matchResults) {
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((error) => `${result.matchDir}: ${error}`));
      }
    }
  }

  return {
    outDir,
    files,
    matchesDir,
    aliasBytes,
    matchSummary,
    truthBundleHash,
    status,
    exitCode,
    errors,
  };
}

export function formatVerifyTournamentReport(report: VerifyTournamentReport): string {
  const lines: string[] = [];
  lines.push(`verify-tournament: ${report.outDir}`);

  const columnWidth = 24;
  for (const file of report.files) {
    const status = file.exists ? "✓ exists" : "✗ missing";
    lines.push(`  ${file.name.padEnd(columnWidth)}  ${status}`);
  }

  if (report.matchesDir.exists) {
    const count = report.matchesDir.count ?? 0;
    lines.push(`  ${report.matchesDir.name.padEnd(columnWidth)}  ✓ found ${count}`);
  } else {
    lines.push(`  ${report.matchesDir.name.padEnd(columnWidth)}  ✗ missing`);
  }

  if (report.aliasBytes) {
    const status = report.aliasBytes.ok
      ? "✓ PASS (manifest == legacy)"
      : "✗ FAIL (manifest != legacy)";
    lines.push(`  ${"aliasBytes".padEnd(columnWidth)}  ${status}`);
  }

  if (report.matchSummary) {
    lines.push("");
    lines.push("  match verification");
    const { passed, failed, errored } = report.matchSummary;
    if (passed > 0) {
      lines.push(`    ✓ ${passed} passed`);
    }
    if (failed > 0) {
      lines.push(`    ✗ ${failed} failed (hash mismatch)`);
    }
    if (errored > 0) {
      lines.push(`    ✗ ${errored} failed (structural error)`);
    }
    if (passed === 0 && failed === 0 && errored === 0) {
      lines.push("    ✗ 0 matches found");
    }
  }

  if (report.truthBundleHash) {
    const label = "truthBundleHash";
    if (report.truthBundleHash.ok) {
      lines.push(`\n  ${label.padEnd(columnWidth)}  ✓ PASS (${report.truthBundleHash.expected})`);
    } else {
      lines.push(`\n  ${label.padEnd(columnWidth)}  ✗ FAIL`);
      lines.push(`    expected: ${report.truthBundleHash.expected}`);
      lines.push(`    actual:   ${report.truthBundleHash.actual}`);
    }
  }

  const resultLabel =
    report.status === "pass" ? "PASS" : report.status === "fail" ? "FAIL" : "ERROR";
  lines.push(`RESULT: ${resultLabel}`);
  return lines.join("\n");
}

export async function runVerifyTournamentCli(argv: string[]): Promise<number> {
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path" && i + 1 < argv.length) {
      outDir = argv[++i];
    }
  }

  if (!outDir) {
    // eslint-disable-next-line no-console
    console.error("Error: --path <outDir> is required");
    return 2;
  }

  const report = await verifyTournamentDirectory(outDir);
  process.stdout.write(`${formatVerifyTournamentReport(report)}\n`);

  if (report.errors.length > 0) {
    for (const error of report.errors) {
      // eslint-disable-next-line no-console
      console.error(`Error: ${error}`);
    }
  }

  return report.exitCode;
}

async function main(): Promise<void> {
  const exitCode = await runVerifyTournamentCli(process.argv.slice(2));
  process.exit(exitCode);
}

const self = fileURLToPath(import.meta.url);
const entry = resolve(process.argv[1] ?? "");
if (self === entry) {
  void main();
}
