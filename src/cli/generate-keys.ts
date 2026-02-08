import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface CliArgs {
  outDir?: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let outDir: string | undefined;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && i + 1 < argv.length) {
      outDir = argv[++i];
    } else if (arg === "--force") {
      force = true;
    }
  }

  return { outDir, force };
}

export async function runGenerateKeysCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.outDir) {
    // eslint-disable-next-line no-console
    console.error("Error: --out <directory> is required");
    return 2;
  }

  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });

  const privateKeyPath = resolve(outDir, "organizer.key");
  const publicKeyPath = resolve(outDir, "organizer.pub");

  if (!args.force && (existsSync(privateKeyPath) || existsSync(publicKeyPath))) {
    // eslint-disable-next-line no-console
    console.error("Error: key files already exist (use --force to overwrite)");
    return 1;
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: {
      format: "pem",
      type: "spki",
    },
    privateKeyEncoding: {
      format: "pem",
      type: "pkcs8",
    },
  });

  writeFileSync(privateKeyPath, privateKey, "utf-8");
  writeFileSync(publicKeyPath, publicKey, "utf-8");

  // eslint-disable-next-line no-console
  console.warn("Keep organizer.key secret. Share organizer.pub with verifiers.");

  return 0;
}

async function main(): Promise<void> {
  const exitCode = await runGenerateKeysCli(process.argv.slice(2));
  process.exit(exitCode);
}

const self = fileURLToPath(import.meta.url);
const entry = resolve(process.argv[1] ?? "");
if (self === entry) {
  void main();
}
