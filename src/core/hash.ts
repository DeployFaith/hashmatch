import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
