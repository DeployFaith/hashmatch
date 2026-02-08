import { mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stableStringify } from "@/core/json";

export type MatchLifecycleStatus = "waiting" | "running" | "finished";

export interface MatchLifecycleStatusRecord {
  matchId: string;
  status: MatchLifecycleStatus;
  scenario: string;
  agents: string[];
  startedAt: string | null;
  finishedAt: string | null;
  verified: boolean | null;
  totalTurns: number;
  currentTurn: number | null;
}

const DEFAULT_DATA_DIR = "./data";

export function resolveDataDir(): string {
  const configured = process.env.HASHMATCH_DATA_DIR ?? DEFAULT_DATA_DIR;
  return resolve(process.cwd(), configured);
}

export function resolveMatchesRoot(): string {
  return join(resolveDataDir(), "matches");
}

export function resolveMatchDir(matchId: string): string {
  return join(resolveMatchesRoot(), matchId);
}

export function ensureMatchesRoot(): void {
  mkdirSync(resolveMatchesRoot(), { recursive: true });
}

export async function readMatchStatus(
  matchDir: string,
): Promise<MatchLifecycleStatusRecord | null> {
  try {
    const raw = await readFile(join(matchDir, "match_status.json"), "utf-8");
    return JSON.parse(raw) as MatchLifecycleStatusRecord;
  } catch {
    return null;
  }
}

export async function writeMatchStatusAtomic(
  matchDir: string,
  status: MatchLifecycleStatusRecord,
): Promise<void> {
  const payload = `${stableStringify(status)}\n`;
  const tmpPath = join(
    matchDir,
    `match_status.json.${process.pid}.${Date.now().toString(36)}.tmp`,
  );
  await writeFile(tmpPath, payload, "utf-8");
  await rename(tmpPath, join(matchDir, "match_status.json"));
}
