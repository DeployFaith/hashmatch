import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, sha256Hex } from "../core/hash.js";
import type { BroadcastManifest, BroadcastManifestFileClass } from "../core/broadcastManifest.js";
import { verifyMatchDirectory } from "./verify-match.js";

const JUNK_FILE_NAMES = new Set([".DS_Store", "Thumbs.db", ".gitkeep", "desktop.ini"]);

export interface ValidateBundleReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ValidateBundleOptions {
  format: "json" | "text";
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

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

async function collectFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      files.push(normalizePath(relative(rootDir, fullPath)));
    }
  }

  await walk(rootDir);
  return files.sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileClass(value: unknown): value is BroadcastManifestFileClass {
  return value === "truth" || value === "telemetry" || value === "show";
}

function validateBroadcastManifest(
  value: unknown,
): { manifest?: BroadcastManifest; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["broadcast_manifest.json must be a JSON object"] };
  }

  if (typeof value.bundleId !== "string") {
    errors.push("broadcast_manifest.json bundleId must be a string");
  }
  if (value.bundleType !== "match" && value.bundleType !== "tournament") {
    errors.push("broadcast_manifest.json bundleType must be 'match' or 'tournament'");
  }
  if (typeof value.modeProfileId !== "string") {
    errors.push("broadcast_manifest.json modeProfileId must be a string");
  }
  if (typeof value.createdBy !== "string") {
    errors.push("broadcast_manifest.json createdBy must be a string");
  }

  if (!Array.isArray(value.files)) {
    errors.push("broadcast_manifest.json files must be an array");
  } else {
    value.files.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`broadcast_manifest.json files[${index}] must be an object`);
        return;
      }
      if (typeof entry.path !== "string") {
        errors.push(`broadcast_manifest.json files[${index}].path must be a string`);
      }
      if (!isFileClass(entry.class)) {
        errors.push(
          `broadcast_manifest.json files[${index}].class must be 'truth', 'telemetry', or 'show'`,
        );
      }
      if (entry.contentHash !== undefined && typeof entry.contentHash !== "string") {
        errors.push(`broadcast_manifest.json files[${index}].contentHash must be a string`);
      }
      if (entry.mediaType !== undefined && typeof entry.mediaType !== "string") {
        errors.push(`broadcast_manifest.json files[${index}].mediaType must be a string`);
      }
    });
  }

  if (value.truthBundleHash !== undefined && typeof value.truthBundleHash !== "string") {
    errors.push("broadcast_manifest.json truthBundleHash must be a string");
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { manifest: value as unknown as BroadcastManifest, errors };
}

function isExpectedTruthPath(path: string): boolean {
  if (path === "tournament_manifest.json" || path === "tournament.json") {
    return true;
  }
  if (!path.startsWith("matches/")) {
    return false;
  }
  return path.endsWith("/match.jsonl") || path.endsWith("/match_manifest.json");
}

function formatSummary(outDir: string, report: ValidateBundleReport): string {
  const lines: string[] = [];
  lines.push(`validate-bundle: ${outDir}`);
  lines.push(`Status: ${report.valid ? "VALID" : "INVALID"}`);
  lines.push(`Errors: ${report.errors.length}`);
  if (report.errors.length > 0) {
    for (const error of report.errors) {
      lines.push(`  - ${error}`);
    }
  }
  lines.push(`Warnings: ${report.warnings.length}`);
  if (report.warnings.length > 0) {
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  return lines.join("\n");
}

export async function validateBundleDirectory(outDir: string): Promise<ValidateBundleReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const manifestPath = join(outDir, "broadcast_manifest.json");
  if (!(await fileExists(manifestPath))) {
    return {
      valid: false,
      errors: ["broadcast_manifest.json is required"],
      warnings,
    };
  }

  let manifest: BroadcastManifest | undefined;
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateBroadcastManifest(parsed);
    if (validation.errors.length > 0) {
      return {
        valid: false,
        errors: validation.errors,
        warnings,
      };
    }
    manifest = validation.manifest;
  } catch (err: unknown) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
      warnings,
    };
  }

  if (!manifest) {
    return {
      valid: false,
      errors: ["broadcast_manifest.json could not be loaded"],
      warnings,
    };
  }
  if (manifest.bundleType !== "tournament") {
    return {
      valid: false,
      errors: ["broadcast_manifest.json bundleType must be 'tournament'"],
      warnings,
    };
  }

  const manifestFiles = manifest.files.map((file) => normalizePath(file.path));
  const manifestFileSet = new Set(manifestFiles);

  const missingFiles: string[] = [];
  for (const filePath of manifestFiles) {
    const fullPath = join(outDir, filePath);
    if (!(await fileExists(fullPath))) {
      missingFiles.push(filePath);
    }
  }
  if (missingFiles.length > 0) {
    errors.push(
      `Missing files listed in broadcast_manifest.json: ${missingFiles.sort().join(", ")}`,
    );
  }

  const allFiles = await collectFiles(outDir);
  for (const filePath of allFiles) {
    const baseName = filePath.split("/").pop() ?? filePath;
    if (JUNK_FILE_NAMES.has(baseName)) {
      continue;
    }
    if (filePath === "broadcast_manifest.json") {
      continue;
    }
    if (!manifestFileSet.has(filePath)) {
      warnings.push(`Unlisted file found: ${filePath}`);
    }
  }

  const matchesDirPath = join(outDir, "matches");
  const hasMatchesDir = await dirExists(matchesDirPath);
  const matchDirs: string[] = [];
  if (!hasMatchesDir) {
    errors.push("Missing matches/ directory");
  } else {
    const entries = await readdir(matchesDirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        matchDirs.push(entry.name);
      }
    }
  }

  for (const matchDir of matchDirs) {
    const matchRoot = join(matchesDirPath, matchDir);
    const matchJsonlPath = join(matchRoot, "match.jsonl");
    const matchManifestPath = join(matchRoot, "match_manifest.json");
    const matchSummaryPath = join(matchRoot, "match_summary.json");

    const hasMatchJsonl = await fileExists(matchJsonlPath);
    const hasMatchManifest = await fileExists(matchManifestPath);
    const hasMatchSummary = await fileExists(matchSummaryPath);

    if (!hasMatchJsonl) {
      errors.push(`Missing required match file: matches/${matchDir}/match.jsonl`);
    }
    if (!hasMatchManifest) {
      errors.push(`Missing required match file: matches/${matchDir}/match_manifest.json`);
    }
    if (!hasMatchSummary) {
      warnings.push(`Missing match_summary.json for matches/${matchDir}`);
    }

    if (hasMatchJsonl && hasMatchManifest && hasMatchSummary) {
      const report = await verifyMatchDirectory(matchRoot);
      if (report.status === "error") {
        for (const error of report.errors) {
          errors.push(`matches/${matchDir}: ${error}`);
        }
      } else if (report.status === "fail") {
        if (report.logHash && !report.logHash.ok) {
          errors.push(`logHash mismatch for matches/${matchDir}/match.jsonl`);
        }
        if (report.manifestHash && !report.manifestHash.ok) {
          errors.push(`manifestHash mismatch for matches/${matchDir}/match_manifest.json`);
        }
      }
    }
  }

  let expectedTruthBundleHash: string | undefined;
  try {
    const tournamentRaw = await readFile(join(outDir, "tournament_manifest.json"), "utf-8");
    const tournamentManifest = JSON.parse(tournamentRaw) as { truthBundleHash?: unknown };
    if (typeof tournamentManifest.truthBundleHash !== "string") {
      errors.push("tournament_manifest.json missing truthBundleHash");
    } else {
      expectedTruthBundleHash = tournamentManifest.truthBundleHash;
    }
  } catch (err: unknown) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  if (expectedTruthBundleHash && matchDirs.length > 0) {
    const logHashes: string[] = [];
    let missingLogHash = false;
    for (const matchDir of matchDirs) {
      const matchJsonlPath = join(matchesDirPath, matchDir, "match.jsonl");
      if (!(await fileExists(matchJsonlPath))) {
        missingLogHash = true;
        continue;
      }
      logHashes.push(await hashFile(matchJsonlPath));
    }

    if (!missingLogHash) {
      const actualTruthBundleHash = sha256Hex(Buffer.from(logHashes.sort().join(""), "utf-8"));
      if (actualTruthBundleHash !== expectedTruthBundleHash) {
        errors.push(
          `truthBundleHash mismatch: expected ${expectedTruthBundleHash}, actual ${actualTruthBundleHash}`,
        );
      }
    }
  }

  const fileClassByPath = new Map<string, BroadcastManifestFileClass>();
  for (const file of manifest.files) {
    fileClassByPath.set(normalizePath(file.path), file.class);
  }

  for (const file of manifest.files) {
    const path = normalizePath(file.path);
    if (file.class === "truth" && !isExpectedTruthPath(path)) {
      warnings.push(`Unexpected truth classification: ${path}`);
    }
    if (isExpectedTruthPath(path) && file.class !== "truth") {
      warnings.push(`Expected truth classification for ${path}, got ${file.class}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function runValidateBundleCli(argv: string[]): Promise<number> {
  let bundlePath: string | undefined;
  let format: ValidateBundleOptions["format"] = "text";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path" && i + 1 < argv.length) {
      bundlePath = argv[++i];
    } else if (arg === "--format" && i + 1 < argv.length) {
      const next = argv[++i];
      if (next === "json" || next === "text") {
        format = next;
      }
    }
  }

  if (!bundlePath) {
    // eslint-disable-next-line no-console
    console.error("Error: --path <tournamentDir> is required");
    return 1;
  }

  const report = await validateBundleDirectory(bundlePath);
  const jsonOutput = JSON.stringify(report);

  if (format === "json") {
    process.stdout.write(`${jsonOutput}\n`);
  } else {
    process.stdout.write(`${jsonOutput}\n`);
    process.stdout.write(`${formatSummary(bundlePath, report)}\n`);
  }

  return report.valid ? 0 : 1;
}

async function main(): Promise<void> {
  const exitCode = await runValidateBundleCli(process.argv.slice(2));
  process.exit(exitCode);
}

const self = fileURLToPath(import.meta.url);
const entry = resolve(process.argv[1] ?? "");
if (self === entry) {
  void main();
}
