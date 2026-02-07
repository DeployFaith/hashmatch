import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableStringify } from "../core/json.js";

export type MatchStatusState = "running" | "complete" | "incomplete" | "failed";

export interface MatchStatus {
  status: MatchStatusState;
  startedAt: string;
  endedAt?: string;
  error?: string;
}

const DEFAULT_MATCH_STORAGE_DIR = join(process.cwd(), "data", "matches");

export function getMatchStorageRoot(): string {
  return process.env.MATCH_STORAGE_DIR ?? DEFAULT_MATCH_STORAGE_DIR;
}

export function getMatchDirectory(matchId: string): string {
  return join(getMatchStorageRoot(), matchId);
}

export function ensureMatchStorageRoot(): void {
  mkdirSync(getMatchStorageRoot(), { recursive: true });
}

export function writeMatchStatus(matchDir: string, status: MatchStatus): void {
  const payload = stableStringify(status) + "\n";
  writeFileSync(join(matchDir, "match_status.json"), payload, "utf-8");
}
