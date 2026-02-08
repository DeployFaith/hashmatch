import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { hashFile, sha256Hex } from "./hash.js";
import type { BroadcastManifest, BroadcastManifestFileClass } from "./broadcastManifest.js";
import { verifyReceipt, type MatchReceiptPayload, type Receipt, type TournamentReceiptPayload } from "./receipt.js";
import type { MatchSummary, StandingsRow, TournamentManifest } from "../tournament/types.js";
import { computeStandings } from "../tournament/standings.js";
import { verifyMatchDirectory } from "../cli/verify-match.js";

/**
 * Step 0 findings (before implementation):
 * - verify-match recomputes logHash via hashFile(match.jsonl) and manifestHash via hashManifestCore.
 * - verify-tournament builds truthBundleHash as sha256Hex(sorted log hashes joined as UTF-8 bytes).
 * - receipts use Ed25519 signatures over canonicalized payloads (stableStringify), verified by verifyReceipt.
 * - broadcast_manifest.json classifies files as truth/telemetry/show with optional contentHash.
 * - writeTournamentArtifacts writes tournament_manifest.json, standings.json, matches/<key>/*, and broadcast_manifest.json.
 * - A real bundle from run-tournament contains tournament_manifest.json, standings.json, broadcast_manifest.json,
 *   matches/<matchKey>/match.jsonl, match_manifest.json, match_summary.json, and verification_result.json.
 */

const REQUIRED_ROOT_FILES = ["tournament_manifest.json", "standings.json"] as const;
const REQUIRED_MATCH_FILES = ["match.jsonl", "match_manifest.json", "match_summary.json"] as const;
const TOURNAMENT_RECEIPT_FILES = ["receipt.json", "tournament_receipt.json"] as const;

export type CheckStatus = "pass" | "fail" | "warn" | "error";

export interface BundleValidationCheck {
  label: string;
  status: CheckStatus;
  summary?: string;
  errors: string[];
  warnings: string[];
  details: string[];
}

export interface BundleValidationChecks {
  structure: BundleValidationCheck;
  crossReferences: BundleValidationCheck;
  contentHashes: BundleValidationCheck;
  tournamentHash: BundleValidationCheck;
  standings: BundleValidationCheck;
  broadcastManifest: BundleValidationCheck;
  signatures: BundleValidationCheck;
}

export interface BundleValidationReport {
  bundlePath: string;
  checks: BundleValidationChecks;
  status: "pass" | "fail" | "error";
  errors: string[];
  warnings: string[];
  exitCode: 0 | 1 | 2;
}

export interface BundleValidationOptions {
  requireSignatures?: boolean;
}

interface StructureResult {
  check: BundleValidationCheck;
  matchDirs: string[];
}

interface CrossReferenceResult {
  check: BundleValidationCheck;
  tournamentManifest?: TournamentManifest;
}

interface MatchHashSummary {
  logHash: string;
  manifestHash: string;
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

async function readJsonFile(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as unknown;
}

function parseTournamentManifest(value: unknown): { manifest?: TournamentManifest; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["tournament_manifest.json must be a JSON object"] };
  }
  if (!Array.isArray(value.matches)) {
    errors.push("tournament_manifest.json matches must be an array");
  } else {
    value.matches.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`tournament_manifest.json matches[${index}] must be an object`);
        return;
      }
      if (typeof entry.matchKey !== "string") {
        errors.push(`tournament_manifest.json matches[${index}].matchKey must be a string`);
      }
    });
  }

  if (errors.length > 0) {
    return { errors };
  }
  return { manifest: value as unknown as TournamentManifest, errors };
}

function parseMatchSummary(value: unknown): { summary?: MatchSummary; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["match_summary.json must be a JSON object"] };
  }
  if (typeof value.matchId !== "string") {
    errors.push("match_summary.json missing matchId");
  }
  if (typeof value.matchKey !== "string") {
    errors.push("match_summary.json missing matchKey");
  }
  if (!Array.isArray(value.agentIds) || !value.agentIds.every((id) => typeof id === "string")) {
    errors.push("match_summary.json agentIds must be string array");
  }
  if (!isRecord(value.scores)) {
    errors.push("match_summary.json scores must be an object");
  }
  if (errors.length > 0) {
    return { errors };
  }
  return { summary: value as unknown as MatchSummary, errors };
}

function parseStandings(value: unknown): { rows?: StandingsRow[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    return { errors: ["standings.json must be an array"] };
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`standings.json[${index}] must be an object`);
      return;
    }
    if (typeof entry.agentId !== "string") {
      errors.push(`standings.json[${index}].agentId must be a string`);
    }
    const numericFields = [
      "matches",
      "wins",
      "losses",
      "draws",
      "points",
      "scoreFor",
      "scoreAgainst",
      "scoreDiff",
    ] as const;
    for (const field of numericFields) {
      if (typeof entry[field] !== "number") {
        errors.push(`standings.json[${index}].${field} must be a number`);
      }
    }
  });
  if (errors.length > 0) {
    return { errors };
  }
  return { rows: value as StandingsRow[], errors };
}

function parseBroadcastManifest(value: unknown): { manifest?: BroadcastManifest; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["broadcast_manifest.json must be a JSON object"] };
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
  if (errors.length > 0) {
    return { errors };
  }
  return { manifest: value as unknown as BroadcastManifest, errors };
}

function parseMatchReceiptPayload(value: unknown): { payload?: MatchReceiptPayload; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["receipt payload must be an object"] };
  }
  if (typeof value.matchId !== "string") {
    errors.push("receipt payload missing matchId");
  }
  if (typeof value.logHash !== "string") {
    errors.push("receipt payload missing logHash");
  }
  if (typeof value.manifestHash !== "string") {
    errors.push("receipt payload missing manifestHash");
  }
  if (typeof value.runnerVersion !== "string") {
    errors.push("receipt payload missing runnerVersion");
  }
  if (typeof value.issuedBy !== "string") {
    errors.push("receipt payload missing issuedBy");
  }
  if (errors.length > 0) {
    return { errors };
  }
  return { payload: value as unknown as MatchReceiptPayload, errors };
}

function parseTournamentReceiptPayload(
  value: unknown,
): { payload?: TournamentReceiptPayload; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["receipt payload must be an object"] };
  }
  if (typeof value.tournamentId !== "string") {
    errors.push("receipt payload missing tournamentId");
  }
  if (typeof value.truthBundleHash !== "string") {
    errors.push("receipt payload missing truthBundleHash");
  }
  if (typeof value.matchCount !== "number") {
    errors.push("receipt payload missing matchCount");
  }
  if (typeof value.issuedBy !== "string") {
    errors.push("receipt payload missing issuedBy");
  }
  if (errors.length > 0) {
    return { errors };
  }
  return { payload: value as unknown as TournamentReceiptPayload, errors };
}

function parseReceipt<T>(
  value: unknown,
  payloadParser: (payload: unknown) => { payload?: T; errors: string[] },
): { receipt?: Receipt<T>; errors: string[] } {
  if (!isRecord(value)) {
    return { errors: ["receipt.json must be a JSON object"] };
  }
  const errors: string[] = [];
  if (value.version !== 1) {
    errors.push("receipt version must be 1");
  }
  if (value.algorithm !== "ed25519") {
    errors.push("receipt algorithm must be ed25519");
  }
  if (!isRecord(value.payload)) {
    errors.push("receipt payload must be an object");
  }
  if (typeof value.signature !== "string") {
    errors.push("receipt signature must be a string");
  }
  if (typeof value.publicKey !== "string") {
    errors.push("receipt publicKey must be a string");
  }
  if (value.signedAt !== undefined && typeof value.signedAt !== "string") {
    errors.push("receipt signedAt must be a string when provided");
  }
  if (errors.length > 0) {
    return { errors };
  }

  const payloadResult = payloadParser(value.payload);
  if (!payloadResult.payload || payloadResult.errors.length > 0) {
    return { errors: payloadResult.errors };
  }

  return {
    receipt: {
      version: 1,
      algorithm: "ed25519",
      payload: payloadResult.payload,
      signature: value.signature as string,
      publicKey: value.publicKey as string,
      signedAt: value.signedAt as string | undefined,
    },
    errors: [],
  };
}

async function checkStructure(bundlePath: string): Promise<StructureResult> {
  const errors: string[] = [];
  const details: string[] = [];
  const warnings: string[] = [];

  for (const file of REQUIRED_ROOT_FILES) {
    const exists = await fileExists(join(bundlePath, file));
    if (!exists) {
      errors.push(`MISSING: ${file}`);
      details.push(`✗ ${file}`);
    } else {
      details.push(`✓ ${file}`);
    }
  }

  const matchesDirPath = join(bundlePath, "matches");
  const matchDirs: string[] = [];
  if (!(await dirExists(matchesDirPath))) {
    errors.push("MISSING: matches/");
    details.push("✗ matches/");
  } else {
    const entries = await readdir(matchesDirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        matchDirs.push(entry.name);
      }
    }
    if (matchDirs.length === 0) {
      errors.push("MISSING: matches/ (no match subfolders)");
    }
    details.push(`✓ matches/ (${matchDirs.length})`);
  }

  for (const matchDir of matchDirs) {
    for (const file of REQUIRED_MATCH_FILES) {
      const relPath = normalizePath(join("matches", matchDir, file));
      const exists = await fileExists(join(bundlePath, relPath));
      if (!exists) {
        errors.push(`MISSING: ${relPath}`);
        details.push(`✗ ${relPath}`);
      } else {
        details.push(`✓ ${relPath}`);
      }
    }
  }

  const status: CheckStatus = errors.length > 0 ? "error" : "pass";
  return {
    check: {
      label: "Structure",
      status,
      errors,
      warnings,
      details,
    },
    matchDirs,
  };
}

async function checkCrossReferences(
  bundlePath: string,
  matchDirs: string[],
): Promise<CrossReferenceResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  let tournamentManifest: TournamentManifest | undefined;
  let hasStructuralError = false;

  const manifestPath = join(bundlePath, "tournament_manifest.json");
  try {
    const manifestRaw = await readJsonFile(manifestPath);
    const parsed = parseTournamentManifest(manifestRaw);
    if (!parsed.manifest) {
      errors.push(...parsed.errors.map((error) => `tournament_manifest.json: ${error}`));
      hasStructuralError = true;
    } else {
      tournamentManifest = parsed.manifest;
    }
  } catch (err: unknown) {
    errors.push(`tournament_manifest.json: ${err instanceof Error ? err.message : String(err)}`);
    hasStructuralError = true;
  }

  const manifestMatchKeys = new Set(
    tournamentManifest?.matches?.map((match) => match.matchKey) ?? [],
  );

  for (const matchKey of manifestMatchKeys) {
    if (!matchDirs.includes(matchKey)) {
      errors.push(`MISSING: matches/${matchKey}/`);
    }
  }

  for (const matchDir of matchDirs) {
    if (!manifestMatchKeys.has(matchDir)) {
      warnings.push(`UNREFERENCED: matches/${matchDir}/`);
    }

    const summaryPath = join(bundlePath, "matches", matchDir, "match_summary.json");
    const manifestPath = join(bundlePath, "matches", matchDir, "match_manifest.json");
    const summaryExists = await fileExists(summaryPath);
    const manifestExists = await fileExists(manifestPath);

    let summaryMatchId: string | undefined;
    if (summaryExists) {
      try {
        const summaryRaw = await readJsonFile(summaryPath);
        const parsed = parseMatchSummary(summaryRaw);
        if (!parsed.summary) {
          errors.push(
            ...parsed.errors.map((error) => `matches/${matchDir}/match_summary.json: ${error}`),
          );
        } else {
          summaryMatchId = parsed.summary.matchId;
          if (parsed.summary.matchKey !== matchDir) {
            errors.push(
              `MISMATCH: matches/${matchDir}/match_summary.json matchKey expected ${matchDir}, got ${parsed.summary.matchKey}`,
            );
          }
        }
      } catch (err: unknown) {
        errors.push(
          `matches/${matchDir}/match_summary.json: ${err instanceof Error ? err.message : String(err)}`,
        );
        hasStructuralError = true;
      }
    }

    if (manifestExists) {
      try {
        const matchManifest = await readJsonFile(manifestPath);
        if (!isRecord(matchManifest) || typeof matchManifest.matchId !== "string") {
          errors.push(`matches/${matchDir}/match_manifest.json missing matchId`);
        } else if (summaryMatchId && matchManifest.matchId !== summaryMatchId) {
          errors.push(
            `MISMATCH: matches/${matchDir}/match_manifest.json matchId expected ${summaryMatchId}, got ${matchManifest.matchId}`,
          );
        }
      } catch (err: unknown) {
        errors.push(
          `matches/${matchDir}/match_manifest.json: ${err instanceof Error ? err.message : String(err)}`,
        );
        hasStructuralError = true;
      }
    }
  }

  const status: CheckStatus = hasStructuralError
    ? "error"
    : errors.length > 0
      ? "fail"
      : warnings.length > 0
        ? "warn"
        : "pass";

  return {
    check: {
      label: "Cross-references",
      status,
      errors,
      warnings,
      details,
    },
    tournamentManifest,
  };
}

async function checkContentHashes(
  bundlePath: string,
  matchDirs: string[],
  matchHashes: Map<string, MatchHashSummary>,
): Promise<BundleValidationCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  let hasStructuralError = false;
  let passed = 0;

  for (const matchDir of matchDirs) {
    const matchRoot = join(bundlePath, "matches", matchDir);
    const report = await verifyMatchDirectory(matchRoot);
    if (report.status === "error") {
      hasStructuralError = true;
      for (const error of report.errors) {
        errors.push(`matches/${matchDir}: ${error}`);
      }
      continue;
    }
    if (report.logHash && report.manifestHash) {
      matchHashes.set(matchDir, {
        logHash: report.logHash.actual,
        manifestHash: report.manifestHash.actual,
      });
    }
    if (report.status === "fail") {
      if (report.logHash && !report.logHash.ok) {
        errors.push(
          `HASH MISMATCH: matches/${matchDir}/match.jsonl — expected ${report.logHash.expected}, got ${report.logHash.actual}`,
        );
        details.push(
          `✗ matches/${matchDir}/match.jsonl (${report.logHash.expected} != ${report.logHash.actual})`,
        );
      } else if (report.logHash) {
        details.push(`✓ matches/${matchDir}/match.jsonl`);
      }
      if (report.manifestHash && !report.manifestHash.ok) {
        errors.push(
          `HASH MISMATCH: matches/${matchDir}/match_manifest.json — expected ${report.manifestHash.expected}, got ${report.manifestHash.actual}`,
        );
        details.push(
          `✗ matches/${matchDir}/match_manifest.json (${report.manifestHash.expected} != ${report.manifestHash.actual})`,
        );
      } else if (report.manifestHash) {
        details.push(`✓ matches/${matchDir}/match_manifest.json`);
      }
    } else {
      if (report.logHash) {
        details.push(`✓ matches/${matchDir}/match.jsonl`);
      }
      if (report.manifestHash) {
        details.push(`✓ matches/${matchDir}/match_manifest.json`);
      }
      passed += 1;
    }
  }

  const status: CheckStatus = hasStructuralError
    ? "error"
    : errors.length > 0
      ? "fail"
      : "pass";
  const summary =
    matchDirs.length > 0 ? `${passed}/${matchDirs.length} matches` : "0 matches";
  return {
    label: "Content hashes",
    status,
    summary: status === "pass" ? summary : undefined,
    errors,
    warnings,
    details,
  };
}

async function checkTournamentHash(
  bundlePath: string,
  tournamentManifest: TournamentManifest | undefined,
  matchDirs: string[],
  matchHashes: Map<string, MatchHashSummary>,
): Promise<BundleValidationCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  let hasStructuralError = false;

  if (!tournamentManifest) {
    return {
      label: "Tournament hash",
      status: "error",
      errors: ["tournament_manifest.json missing or invalid"],
      warnings,
      details,
    };
  }

  if (typeof tournamentManifest.truthBundleHash !== "string") {
    return {
      label: "Tournament hash",
      status: "pass",
      summary: "skipped (truthBundleHash missing)",
      errors,
      warnings,
      details,
    };
  }

  const logHashes: string[] = [];
  for (const matchDir of matchDirs) {
    const hashes = matchHashes.get(matchDir);
    if (!hashes) {
      hasStructuralError = true;
      errors.push(`Missing logHash for matches/${matchDir}`);
      continue;
    }
    logHashes.push(hashes.logHash);
  }

  if (hasStructuralError) {
    return {
      label: "Tournament hash",
      status: "error",
      errors,
      warnings,
      details,
    };
  }

  const actual = sha256Hex(Buffer.from(logHashes.sort().join(""), "utf-8"));
  if (actual !== tournamentManifest.truthBundleHash) {
    errors.push(
      `HASH MISMATCH: tournament_manifest.json truthBundleHash — expected ${tournamentManifest.truthBundleHash}, got ${actual}`,
    );
  }

  return {
    label: "Tournament hash",
    status: errors.length > 0 ? "fail" : "pass",
    summary: errors.length === 0 ? tournamentManifest.truthBundleHash : undefined,
    errors,
    warnings,
    details,
  };
}

async function checkStandings(
  bundlePath: string,
  matchDirs: string[],
  tournamentManifest: TournamentManifest | undefined,
): Promise<BundleValidationCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  let hasStructuralError = false;

  if (!tournamentManifest) {
    return {
      label: "Standings",
      status: "error",
      errors: ["tournament_manifest.json missing or invalid"],
      warnings,
      details,
    };
  }

  let standingsRows: StandingsRow[] | undefined;
  try {
    const standingsRaw = await readJsonFile(join(bundlePath, "standings.json"));
    const parsed = parseStandings(standingsRaw);
    if (!parsed.rows) {
      errors.push(...parsed.errors.map((error) => `standings.json: ${error}`));
      hasStructuralError = true;
    } else {
      standingsRows = parsed.rows;
    }
  } catch (err: unknown) {
    errors.push(`standings.json: ${err instanceof Error ? err.message : String(err)}`);
    hasStructuralError = true;
  }

  const matchSummaries: MatchSummary[] = [];
  for (const matchDir of matchDirs) {
    const summaryPath = join(bundlePath, "matches", matchDir, "match_summary.json");
    try {
      const summaryRaw = await readJsonFile(summaryPath);
      const parsed = parseMatchSummary(summaryRaw);
      if (!parsed.summary) {
        errors.push(
          ...parsed.errors.map((error) => `matches/${matchDir}/match_summary.json: ${error}`),
        );
        hasStructuralError = true;
      } else {
        matchSummaries.push(parsed.summary);
      }
    } catch (err: unknown) {
      errors.push(
        `matches/${matchDir}/match_summary.json: ${err instanceof Error ? err.message : String(err)}`,
      );
      hasStructuralError = true;
    }
  }

  if (hasStructuralError || !standingsRows) {
    return {
      label: "Standings",
      status: "error",
      errors,
      warnings,
      details,
    };
  }

  const recomputed = computeStandings(tournamentManifest.agents, matchSummaries);
  const expectedByAgent = new Map(recomputed.map((row) => [row.agentId, row]));
  const actualByAgent = new Map(standingsRows.map((row) => [row.agentId, row]));

  for (const [agentId, expected] of expectedByAgent) {
    const actual = actualByAgent.get(agentId);
    if (!actual) {
      errors.push(`STANDINGS MISMATCH: ${agentId} missing from standings.json`);
      continue;
    }
    const fields: Array<keyof StandingsRow> = [
      "matches",
      "wins",
      "losses",
      "draws",
      "points",
      "scoreFor",
      "scoreAgainst",
      "scoreDiff",
    ];
    for (const field of fields) {
      if (expected[field] !== actual[field]) {
        const message = `STANDINGS MISMATCH: ${agentId} ${field} expected ${expected[field]}, actual ${actual[field]}`;
        errors.push(message);
        if (field === "points") {
          details.push(message);
        }
      }
    }
  }

  for (const [agentId] of actualByAgent) {
    if (!expectedByAgent.has(agentId)) {
      errors.push(`STANDINGS MISMATCH: ${agentId} unexpected in standings.json`);
    }
  }

  return {
    label: "Standings",
    status: errors.length > 0 ? "fail" : "pass",
    errors,
    warnings,
    details,
  };
}

async function checkBroadcastManifest(bundlePath: string): Promise<BundleValidationCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  const manifestPath = join(bundlePath, "broadcast_manifest.json");
  if (!(await fileExists(manifestPath))) {
    return {
      label: "Broadcast manifest",
      status: "pass",
      summary: "skipped (not present)",
      errors,
      warnings,
      details,
    };
  }

  let manifest: BroadcastManifest | undefined;
  try {
    const manifestRaw = await readJsonFile(manifestPath);
    const parsed = parseBroadcastManifest(manifestRaw);
    if (!parsed.manifest) {
      errors.push(...parsed.errors.map((error) => `broadcast_manifest.json: ${error}`));
    } else {
      manifest = parsed.manifest;
    }
  } catch (err: unknown) {
    errors.push(`broadcast_manifest.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!manifest) {
    return {
      label: "Broadcast manifest",
      status: "fail",
      errors,
      warnings,
      details,
    };
  }

  const listedFiles = new Set(manifest.files.map((file) => normalizePath(file.path)));
  for (const file of manifest.files) {
    const relPath = normalizePath(file.path);
    const filePath = join(bundlePath, relPath);
    if (!(await fileExists(filePath))) {
      errors.push(`MISSING: ${relPath}`);
      continue;
    }
    if (file.contentHash) {
      const actual = await hashFile(filePath);
      if (actual !== file.contentHash) {
        errors.push(
          `HASH MISMATCH: ${relPath} — expected ${file.contentHash}, got ${actual}`,
        );
      }
    }
    details.push(`✓ ${relPath}`);
  }

  const allFiles = await collectFiles(bundlePath);
  for (const filePath of allFiles) {
    if (filePath === "broadcast_manifest.json") {
      continue;
    }
    if (!listedFiles.has(filePath)) {
      warnings.push(`UNLISTED: ${filePath}`);
    }
  }

  const status: CheckStatus =
    errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";
  return {
    label: "Broadcast manifest",
    status,
    errors,
    warnings,
    details,
  };
}

async function resolveTournamentReceiptPath(bundlePath: string): Promise<string | undefined> {
  for (const file of TOURNAMENT_RECEIPT_FILES) {
    const fullPath = join(bundlePath, file);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

async function checkSignatures(
  bundlePath: string,
  matchDirs: string[],
  matchHashes: Map<string, MatchHashSummary>,
  tournamentManifest: TournamentManifest | undefined,
  options: BundleValidationOptions,
): Promise<BundleValidationCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  let receiptCount = 0;

  for (const matchDir of matchDirs) {
    const receiptPath = join(bundlePath, "matches", matchDir, "receipt.json");
    if (!(await fileExists(receiptPath))) {
      const message = `MISSING: matches/${matchDir}/receipt.json`;
      if (options.requireSignatures) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
      continue;
    }

    receiptCount += 1;
    let parsedReceipt: Receipt<MatchReceiptPayload> | undefined;
    try {
      const receiptRaw = await readJsonFile(receiptPath);
      const parsed = parseReceipt(receiptRaw, parseMatchReceiptPayload);
      if (!parsed.receipt) {
        errors.push(
          ...parsed.errors.map((error) => `matches/${matchDir}/receipt.json: ${error}`),
        );
        continue;
      }
      parsedReceipt = parsed.receipt;
    } catch (err: unknown) {
      errors.push(
        `matches/${matchDir}/receipt.json: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    if (!verifyReceipt(parsedReceipt)) {
      errors.push(`SIGNATURE INVALID: matches/${matchDir}/receipt.json`);
      continue;
    }

    const summaryPath = join(bundlePath, "matches", matchDir, "match_summary.json");
    try {
      const summaryRaw = await readJsonFile(summaryPath);
      const parsedSummary = parseMatchSummary(summaryRaw);
      if (parsedSummary.summary && parsedReceipt.payload.matchId !== parsedSummary.summary.matchId) {
        errors.push(
          `RECEIPT MISMATCH: matches/${matchDir}/receipt.json matchId expected ${parsedSummary.summary.matchId}, got ${parsedReceipt.payload.matchId}`,
        );
      }
    } catch (err: unknown) {
      errors.push(
        `matches/${matchDir}/match_summary.json: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const hashes = matchHashes.get(matchDir);
    if (!hashes) {
      errors.push(`Missing hashes for matches/${matchDir}`);
    } else {
      if (parsedReceipt.payload.logHash !== hashes.logHash) {
        errors.push(
          `RECEIPT MISMATCH: matches/${matchDir}/receipt.json logHash expected ${hashes.logHash}, got ${parsedReceipt.payload.logHash}`,
        );
      }
      if (parsedReceipt.payload.manifestHash !== hashes.manifestHash) {
        errors.push(
          `RECEIPT MISMATCH: matches/${matchDir}/receipt.json manifestHash expected ${hashes.manifestHash}, got ${parsedReceipt.payload.manifestHash}`,
        );
      }
    }

    details.push(`✓ matches/${matchDir}/receipt.json`);
  }

  const tournamentReceiptPath = await resolveTournamentReceiptPath(bundlePath);
  if (!tournamentReceiptPath) {
    const message = "MISSING: tournament receipt.json";
    if (options.requireSignatures) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  } else {
    receiptCount += 1;
    try {
      const receiptRaw = await readJsonFile(tournamentReceiptPath);
      const parsed = parseReceipt(receiptRaw, parseTournamentReceiptPayload);
      if (!parsed.receipt) {
        errors.push(
          ...parsed.errors.map((error) => `${normalizePath(relative(bundlePath, tournamentReceiptPath))}: ${error}`),
        );
      } else if (!verifyReceipt(parsed.receipt)) {
        errors.push(
          `SIGNATURE INVALID: ${normalizePath(relative(bundlePath, tournamentReceiptPath))}`,
        );
      } else {
        if (!tournamentManifest) {
          errors.push("tournament_manifest.json missing or invalid");
        } else {
          const logHashes = matchDirs
            .map((matchDir) => matchHashes.get(matchDir)?.logHash)
            .filter((hash): hash is string => typeof hash === "string");
          if (logHashes.length !== matchDirs.length) {
            errors.push("Missing log hashes for tournament receipt verification");
          } else {
            const actualTruthBundleHash = sha256Hex(
              Buffer.from(logHashes.sort().join(""), "utf-8"),
            );
            if (parsed.receipt.payload.truthBundleHash !== actualTruthBundleHash) {
              errors.push(
                `RECEIPT MISMATCH: ${normalizePath(relative(bundlePath, tournamentReceiptPath))} truthBundleHash expected ${actualTruthBundleHash}, got ${parsed.receipt.payload.truthBundleHash}`,
              );
            }
          }
          if (parsed.receipt.payload.matchCount !== matchDirs.length) {
            errors.push(
              `RECEIPT MISMATCH: ${normalizePath(relative(bundlePath, tournamentReceiptPath))} matchCount expected ${matchDirs.length}, got ${parsed.receipt.payload.matchCount}`,
            );
          }
        }
      }
    } catch (err: unknown) {
      errors.push(
        `${normalizePath(relative(bundlePath, tournamentReceiptPath))}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  let status: CheckStatus = "pass";
  if (errors.length > 0) {
    status = "fail";
  } else if (warnings.length > 0) {
    status = "warn";
  }

  let summary: string | undefined;
  if (status === "warn" && receiptCount === 0) {
    summary = "no receipts found; use --require-signatures to enforce";
  } else if (status === "pass") {
    summary = receiptCount > 0 ? `${receiptCount} receipts verified` : undefined;
  }

  return {
    label: "Signatures",
    status,
    summary,
    errors,
    warnings,
    details,
  };
}

function summarizeReport(checks: BundleValidationChecks): {
  status: "pass" | "fail" | "error";
  exitCode: 0 | 1 | 2;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checkList = Object.values(checks);
  for (const check of checkList) {
    errors.push(...check.errors);
    warnings.push(...check.warnings);
  }

  const hasError = checkList.some((check) => check.status === "error");
  const hasFail = checkList.some((check) => check.status === "fail");
  const status: "pass" | "fail" | "error" = hasError ? "error" : hasFail ? "fail" : "pass";
  const exitCode: 0 | 1 | 2 = hasError ? 2 : hasFail ? 1 : 0;

  return { status, exitCode, errors, warnings };
}

export async function validateBundle(
  bundlePath: string,
  options: BundleValidationOptions = {},
): Promise<BundleValidationReport> {
  const resolvedPath = resolve(bundlePath);
  const structure = await checkStructure(resolvedPath);
  const crossReferences = await checkCrossReferences(resolvedPath, structure.matchDirs);
  const matchHashes = new Map<string, MatchHashSummary>();
  const contentHashes = await checkContentHashes(resolvedPath, structure.matchDirs, matchHashes);
  const tournamentHash = await checkTournamentHash(
    resolvedPath,
    crossReferences.tournamentManifest,
    structure.matchDirs,
    matchHashes,
  );
  const standings = await checkStandings(
    resolvedPath,
    structure.matchDirs,
    crossReferences.tournamentManifest,
  );
  const broadcastManifest = await checkBroadcastManifest(resolvedPath);
  const signatures = await checkSignatures(
    resolvedPath,
    structure.matchDirs,
    matchHashes,
    crossReferences.tournamentManifest,
    options,
  );

  const checks: BundleValidationChecks = {
    structure: structure.check,
    crossReferences: crossReferences.check,
    contentHashes,
    tournamentHash,
    standings,
    broadcastManifest,
    signatures,
  };

  const summary = summarizeReport(checks);

  return {
    bundlePath: resolvedPath,
    checks,
    status: summary.status,
    errors: summary.errors,
    warnings: summary.warnings,
    exitCode: summary.exitCode,
  };
}
