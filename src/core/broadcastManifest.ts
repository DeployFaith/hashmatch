import { sha256Hex } from "./hash.js";
import { stableStringify } from "./json.js";

export type BroadcastManifestFileClass = "truth" | "telemetry" | "show";

export interface BroadcastManifestFileEntry {
  path: string;
  class: BroadcastManifestFileClass;
  contentHash?: string;
  mediaType?: string;
}

export interface BroadcastManifest {
  bundleId: string;
  bundleType: "match" | "tournament";
  modeProfileId: string;
  createdBy: string;
  files: BroadcastManifestFileEntry[];
  truthBundleHash?: string;
}

export function sortBroadcastManifestFiles(
  files: BroadcastManifestFileEntry[],
): BroadcastManifestFileEntry[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

export function hashTruthBundle(fileHashes: Record<string, string>): string {
  if (Object.keys(fileHashes).length === 0) {
    throw new Error("Cannot compute truthBundleHash with no truth files.");
  }
  let serialized = stableStringify(fileHashes);
  serialized = serialized.replace(/\n*$/, "\n");
  return sha256Hex(Buffer.from(serialized, "utf-8"));
}
