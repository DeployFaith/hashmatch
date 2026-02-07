import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, hashManifestCore } from "../core/hash.js";

const REQUIRED_FILES = ["match.jsonl", "match_manifest.json", "match_summary.json"] as const;

export type VerifyMatchStatus = "pass" | "fail" | "error";

export interface VerifyMatchFileStatus {
  name: string;
  exists: boolean;
}

export interface VerifyMatchHashStatus {
  expected: string;
  actual: string;
  ok: boolean;
}

export interface VerifyMatchReport {
  matchDir: string;
  files: VerifyMatchFileStatus[];
  logHash?: VerifyMatchHashStatus;
  manifestHash?: VerifyMatchHashStatus;
  status: VerifyMatchStatus;
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

function parseSummaryHashes(raw: string): { logHash: string; manifestHash: string } {
  const parsed = JSON.parse(raw) as { hashes?: { logHash?: unknown; manifestHash?: unknown } };
  const hashes = parsed.hashes;
  if (!hashes) {
    throw new Error("match_summary.json missing hashes field");
  }
  if (typeof hashes.logHash !== "string" || typeof hashes.manifestHash !== "string") {
    throw new Error("match_summary.json hashes must include logHash and manifestHash strings");
  }
  return { logHash: hashes.logHash, manifestHash: hashes.manifestHash };
}

export async function verifyMatchDirectory(matchDir: string): Promise<VerifyMatchReport> {
  const files = await Promise.all(
    REQUIRED_FILES.map(async (name) => ({
      name,
      exists: await fileExists(join(matchDir, name)),
    })),
  );

  const missing = files.filter((file) => !file.exists).map((file) => file.name);
  if (missing.length > 0) {
    return {
      matchDir,
      files,
      status: "error",
      exitCode: 2,
      errors: [`Missing required files: ${missing.join(", ")}`],
    };
  }

  const summaryPath = join(matchDir, "match_summary.json");
  let expectedHashes: { logHash: string; manifestHash: string };
  try {
    const summaryRaw = await readFile(summaryPath, "utf-8");
    expectedHashes = parseSummaryHashes(summaryRaw);
  } catch (err: unknown) {
    return {
      matchDir,
      files,
      status: "error",
      exitCode: 2,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const logPath = join(matchDir, "match.jsonl");
  const manifestPath = join(matchDir, "match_manifest.json");

  let actualLogHash: string;
  let actualManifestHash: string;
  try {
    actualLogHash = await hashFile(logPath);
    const manifestRaw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
    actualManifestHash = hashManifestCore(manifest);
  } catch (err: unknown) {
    return {
      matchDir,
      files,
      status: "error",
      exitCode: 2,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const logHash: VerifyMatchHashStatus = {
    expected: expectedHashes.logHash,
    actual: actualLogHash,
    ok: expectedHashes.logHash === actualLogHash,
  };
  const manifestHash: VerifyMatchHashStatus = {
    expected: expectedHashes.manifestHash,
    actual: actualManifestHash,
    ok: expectedHashes.manifestHash === actualManifestHash,
  };

  const passed = logHash.ok && manifestHash.ok;
  return {
    matchDir,
    files,
    logHash,
    manifestHash,
    status: passed ? "pass" : "fail",
    exitCode: passed ? 0 : 1,
    errors: [],
  };
}

export function formatVerifyMatchReport(report: VerifyMatchReport): string {
  const lines: string[] = [];
  lines.push(`verify-match: ${report.matchDir}`);

  const columnWidth = 20;
  for (const file of report.files) {
    const status = file.exists ? "✓ exists" : "✗ missing";
    lines.push(`  ${file.name.padEnd(columnWidth)}  ${status}`);
  }

  const addHashLine = (label: string, hash: VerifyMatchHashStatus): void => {
    if (hash.ok) {
      lines.push(`  ${label.padEnd(columnWidth)}  ✓ PASS (${hash.expected})`);
      return;
    }
    lines.push(`  ${label.padEnd(columnWidth)}  ✗ FAIL`);
    lines.push(`    expected: ${hash.expected}`);
    lines.push(`    actual:   ${hash.actual}`);
  };

  if (report.logHash) {
    addHashLine("logHash", report.logHash);
  }
  if (report.manifestHash) {
    addHashLine("manifestHash", report.manifestHash);
  }

  const resultLabel = report.status === "pass" ? "PASS" : report.status === "fail" ? "FAIL" : "ERROR";
  lines.push(`RESULT: ${resultLabel}`);
  return lines.join("\n");
}

export async function runVerifyMatchCli(argv: string[]): Promise<number> {
  let matchDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path" && i + 1 < argv.length) {
      matchDir = argv[++i];
    }
  }

  if (!matchDir) {
    // eslint-disable-next-line no-console
    console.error("Error: --path <matchDir> is required");
    return 2;
  }

  const report = await verifyMatchDirectory(matchDir);
  process.stdout.write(`${formatVerifyMatchReport(report)}\n`);

  if (report.errors.length > 0) {
    for (const error of report.errors) {
      // eslint-disable-next-line no-console
      console.error(`Error: ${error}`);
    }
  }

  return report.exitCode;
}

async function main(): Promise<void> {
  const exitCode = await runVerifyMatchCli(process.argv.slice(2));
  process.exit(exitCode);
}

// Only run when executed directly (not when imported by tests)
const self = fileURLToPath(import.meta.url);
const entry = resolve(process.argv[1] ?? "");
if (self === entry) {
  void main();
}
