import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateJsonlText } from "../src/lib/replay/validateJsonl";

const args = process.argv.slice(2);
const allowInvalid = args.includes("--allow-invalid");
const allowUnknown = args.includes("--allow-unknown");
const pathArg = args.find((arg) => !arg.startsWith("--"));

if (!pathArg) {
  console.error("Usage: npm run validate:jsonl -- <path> [--allow-unknown] [--allow-invalid]");
  process.exit(1);
}

const filePath = resolve(process.cwd(), pathArg);
const text = readFileSync(filePath, "utf-8");
const result = validateJsonlText(text, { allowUnknown });

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`Line ${error.line}: ${error.message}`);
  }
}

const sortedTypes = Object.keys(result.typeCounts).sort((a, b) => a.localeCompare(b));
console.log("Event counts:");
for (const type of sortedTypes) {
  console.log(`  ${type}: ${result.typeCounts[type]}`);
}
console.log(
  `Summary: ${result.validLines} valid, ${result.invalidLines} invalid, ${result.totalLines} total`,
);

if (!allowInvalid && result.invalidLines > 0) {
  process.exit(2);
}
