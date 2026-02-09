import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { hashFile, hashManifestCore } from "./hash.js";

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
