import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyMatchDirectory,
  type VerifyMatchHashStatus,
  type VerifyMatchReport,
} from "../core/verifyMatchDirectory.js";

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

  const resultLabel =
    report.status === "pass" ? "PASS" : report.status === "fail" ? "FAIL" : "ERROR";
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
