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

export function sanitizeScenarioLabel(scenario: string): string {
  const normalized = scenario.trim().toLowerCase();
  const sanitized = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "scenario";
}

export function formatMatchTimestamp(date: Date): string {
  return [
    pad(date.getUTCFullYear(), 4),
    pad(date.getUTCMonth() + 1, 2),
    pad(date.getUTCDate(), 2),
  ].join("")
    .concat(
      "-",
      [
        pad(date.getUTCHours(), 2),
        pad(date.getUTCMinutes(), 2),
        pad(date.getUTCSeconds(), 2),
      ].join(""),
      "-",
      pad(date.getUTCMilliseconds(), 3),
    );
}

export function buildOperatorMatchId(date: Date, scenario: string): string {
  const timestamp = formatMatchTimestamp(date);
  const scenarioLabel = sanitizeScenarioLabel(scenario);
  return `match-${timestamp}-${scenarioLabel}`;
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
