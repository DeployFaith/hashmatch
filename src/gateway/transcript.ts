import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { stableStringify } from "../core/json.js";
import type { GatewayTranscriptEntry } from "./types.js";

export const GATEWAY_TRANSCRIPT_FILENAME = "gateway_transcript.jsonl";

export interface TranscriptWriter {
  path: string;
  write(entry: GatewayTranscriptEntry): void;
}

export function createTranscriptWriter(matchDir: string): TranscriptWriter {
  const path = join(matchDir, GATEWAY_TRANSCRIPT_FILENAME);
  return {
    path,
    write(entry) {
      const line = `${stableStringify(entry)}\n`;
      appendFileSync(path, line, "utf-8");
    },
  };
}
