import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { stableStringify } from "./json.js";

/**
 * SHA-256 hash of raw bytes. Returns "sha256:" + lowercase hex.
 */
export function sha256Hex(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * SHA-256 hash of a file's raw bytes on disk.
 */
export async function hashFile(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return sha256Hex(bytes);
}

export interface ArtifactContentHashOptions {
  rootDir: string;
  includePaths: string[];
  excludePaths?: string[];
  excludeExtensions?: string[];
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function shouldExclude(
  relativePath: string,
  excludePaths: string[],
  excludeExtensions: string[],
): boolean {
  if (excludeExtensions.some((ext) => relativePath.endsWith(ext))) {
    return true;
  }
  return excludePaths.some(
    (excludePath) => relativePath === excludePath || relativePath.startsWith(`${excludePath}/`),
  );
}

async function collectFiles(
  rootDir: string,
  includePaths: string[],
  excludePaths: string[],
  excludeExtensions: string[],
): Promise<string[]> {
  const files: string[] = [];

  async function walk(entryPath: string): Promise<void> {
    const entries = await readdir(entryPath, { withFileTypes: true });
    const sortedEntries = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sortedEntries) {
      const fullPath = join(entryPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relPath = normalizePath(relative(rootDir, fullPath));
      if (shouldExclude(relPath, excludePaths, excludeExtensions)) {
        continue;
      }
      files.push(relPath);
    }
  }

  for (const includePath of includePaths) {
    const fullPath = join(rootDir, includePath);
    const entryStat = await stat(fullPath);
    if (entryStat.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (entryStat.isFile()) {
      const relPath = normalizePath(relative(rootDir, fullPath));
      if (!shouldExclude(relPath, excludePaths, excludeExtensions)) {
        files.push(relPath);
      }
    }
  }

  return files.sort();
}

/**
 * SHA-256 hash of a deterministic manifest describing an artifact.
 * The manifest is a stable JSON map of relativePath -> sha256(fileBytes),
 * sorted by relativePath and ending with exactly one \n.
 */
export async function computeArtifactContentHash(
  options: ArtifactContentHashOptions,
): Promise<string> {
  const { rootDir, includePaths, excludePaths = [], excludeExtensions = [] } = options;
  const files = await collectFiles(rootDir, includePaths, excludePaths, excludeExtensions);
  if (files.length === 0) {
    throw new Error("No files matched for artifact hashing.");
  }
  const manifest: Record<string, string> = {};
  for (const relPath of files) {
    manifest[relPath] = await hashFile(join(rootDir, relPath));
  }
  let serialized = stableStringify(manifest);
  serialized = serialized.replace(/\n*$/, "\n");
  return sha256Hex(Buffer.from(serialized, "utf-8"));
}

/**
 * SHA-256 hash of manifestCore: manifest object with excluded fields removed,
 * serialized by the stable serializer, ending with exactly one \n.
 */
export function hashManifestCore(
  manifest: Record<string, unknown>,
  excludeFields: string[] = ["createdAt"],
): string {
  const core: Record<string, unknown> = { ...manifest };
  for (const field of excludeFields) {
    delete core[field];
  }

  let serialized = stableStringify(core);
  serialized = serialized.replace(/\n*$/, "\n");

  return sha256Hex(Buffer.from(serialized, "utf-8"));
}
