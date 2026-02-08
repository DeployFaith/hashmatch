import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { stableStringify } from "../core/json.js";

export type OperatorMatchStatusState = "running" | "completed" | "crashed";

export interface OperatorMatchStatus {
  matchId: string;
  status: OperatorMatchStatusState;
  scenario: string;
  agents: string[];
  seed?: number;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, "0");
}

export function formatMatchTimestamp(date: Date): string {
  return [pad(date.getUTCFullYear(), 4), pad(date.getUTCMonth() + 1, 2), pad(date.getUTCDate(), 2)]
    .join("")
    .concat(
      "-",
      [pad(date.getUTCHours(), 2), pad(date.getUTCMinutes(), 2), pad(date.getUTCSeconds(), 2)].join(
        "",
      ),
      "-",
      pad(date.getUTCMilliseconds(), 3),
    );
}

export function buildOperatorMatchId(date: Date): string {
  const timestamp = formatMatchTimestamp(date);
  const suffix = randomBytes(8).toString("hex");
  return `match-${timestamp}-${suffix}`;
}

export function readOperatorMatchStatus(path: string): OperatorMatchStatus | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as OperatorMatchStatus;
  } catch {
    return null;
  }
}

export function writeOperatorMatchStatus(path: string, status: OperatorMatchStatus): void {
  writeFileSync(path, stableStringify(status) + "\n", "utf-8");
}
