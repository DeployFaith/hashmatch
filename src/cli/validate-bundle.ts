import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateBundle,
  type BundleValidationCheck,
  type BundleValidationReport,
} from "../core/bundleValidator.js";

interface CliArgs {
  bundlePath?: string;
  requireSignatures: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let bundlePath: string | undefined;
  let requireSignatures = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--path" && i + 1 < argv.length) {
      bundlePath = argv[++i];
    } else if (arg === "--require-signatures") {
      requireSignatures = true;
    } else if (arg === "--verbose") {
      verbose = true;
    }
  }

  return { bundlePath, requireSignatures, verbose };
}

function formatStatus(status: BundleValidationCheck["status"]): string {
  if (status === "pass") {
    return "PASS";
  }
  if (status === "warn") {
    return "WARN";
  }
  if (status === "error") {
    return "ERROR";
  }
  return "FAIL";
}

function formatCheckLine(check: BundleValidationCheck): string {
  const label = check.label;
  const dots = ".".repeat(Math.max(1, 22 - label.length));
  const statusLabel = formatStatus(check.status);
  const summary = check.summary ? ` (${check.summary})` : "";
  return `  ${label} ${dots} ${statusLabel}${summary}`;
}

function formatCheckDetails(check: BundleValidationCheck, verbose: boolean): string[] {
  const lines: string[] = [];
  for (const error of check.errors) {
    lines.push(`    ✗ ${error}`);
  }
  for (const warning of check.warnings) {
    lines.push(`    ⚠ ${warning}`);
  }
  if (verbose) {
    for (const detail of check.details) {
      lines.push(`    • ${detail}`);
    }
  }
  return lines;
}

function formatResultSummary(report: BundleValidationReport): string {
  const errorCount = report.errors.length;
  const warningCount = report.warnings.length;
  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
  }
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `  Result: ${report.status.toUpperCase()}${suffix}`;
}

export function formatValidateBundleReport(
  report: BundleValidationReport,
  verbose: boolean,
): string {
  const lines: string[] = [];
  lines.push(`validate-bundle: ${report.bundlePath}`);
  lines.push("");

  const checks = [
    report.checks.structure,
    report.checks.crossReferences,
    report.checks.contentHashes,
    report.checks.tournamentHash,
    report.checks.standings,
    report.checks.broadcastManifest,
    report.checks.signatures,
  ];

  for (const check of checks) {
    lines.push(formatCheckLine(check));
    lines.push(...formatCheckDetails(check, verbose));
  }

  lines.push("");
  lines.push(formatResultSummary(report));

  return lines.join("\n");
}

export async function runValidateBundleCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (!args.bundlePath) {
    // eslint-disable-next-line no-console
    console.error("Error: --path <tournament_folder> is required");
    return 2;
  }

  const report = await validateBundle(resolve(args.bundlePath), {
    requireSignatures: args.requireSignatures,
  });
  process.stdout.write(`${formatValidateBundleReport(report, args.verbose)}\n`);

  return report.exitCode;
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
