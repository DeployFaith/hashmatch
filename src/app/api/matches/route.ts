import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isSafeMatchId } from "@/engine/matchId";
import { listExhibitionMatchDirectories } from "@/server/exhibitionStorage";
import { getMatchStorageRoot } from "@/server/matchStorage";
import type { MatchListItem, MatchStatusRecord, MatchSummaryRecord } from "@/lib/matches/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function resolveScenarioName(manifest: Record<string, unknown> | null): string | undefined {
  if (!manifest) {
    return undefined;
  }
  const scenario = manifest.scenario;
  if (scenario && typeof scenario === "object") {
    const scenarioId = (scenario as { id?: unknown }).id;
    if (typeof scenarioId === "string") {
      return scenarioId;
    }
  }
  return undefined;
}

function extractSummaryTimestamp(summary: MatchSummaryRecord): number | null {
  const summaryAny = summary as MatchSummaryRecord & {
    createdAt?: string;
    startedAt?: string;
    endedAt?: string;
  };
  const candidate = summaryAny.createdAt ?? summaryAny.startedAt ?? summaryAny.endedAt ?? null;
  if (!candidate) {
    return null;
  }
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function GET(): Promise<Response> {
  const root = getMatchStorageRoot();
  if (!existsSync(root)) {
    const exhibitionEntries = await loadExhibitionEntries();
    return NextResponse.json(exhibitionEntries);
  }

  let entries: MatchListItem[] = [];
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    const matchDirs = dirents.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);

    const results = await Promise.all(
      matchDirs.map(async (matchId) => {
        if (!isSafeMatchId(matchId)) {
          return null;
        }
        const matchDir = join(root, matchId);
        const summary = await readJsonFile<MatchSummaryRecord>(
          join(matchDir, "match_summary.json"),
        );
        if (!summary) {
          return null;
        }

        const status = await readJsonFile<MatchStatusRecord>(join(matchDir, "match_status.json"));
        const manifest = await readJsonFile<Record<string, unknown>>(
          join(matchDir, "match_manifest.json"),
        );
        return {
          matchId: summary.matchId ?? matchId,
          scenarioName: resolveScenarioName(manifest),
          status,
          summary,
        } satisfies MatchListItem;
      }),
    );

    entries = results.filter(Boolean) as MatchListItem[];
  } catch {
    entries = [];
  }

  const exhibitionEntries = await loadExhibitionEntries();
  const entriesById = new Map(entries.map((entry) => [entry.matchId, entry]));
  for (const entry of exhibitionEntries) {
    if (!entriesById.has(entry.matchId)) {
      entriesById.set(entry.matchId, entry);
    }
  }

  const ordered = Array.from(entriesById.values())
    .map((entry) => ({
      entry,
      timestamp: extractSummaryTimestamp(entry.summary),
    }))
    .sort((a, b) => {
      if (a.timestamp !== null && b.timestamp !== null) {
        if (a.timestamp !== b.timestamp) {
          return b.timestamp - a.timestamp;
        }
        return a.entry.matchId.localeCompare(b.entry.matchId);
      }
      if (a.timestamp !== null) {
        return -1;
      }
      if (b.timestamp !== null) {
        return 1;
      }
      return a.entry.matchId.localeCompare(b.entry.matchId);
    })
    .map(({ entry }) => entry);

  return NextResponse.json(ordered);
}

async function loadExhibitionEntries(): Promise<MatchListItem[]> {
  const matchDirs = await listExhibitionMatchDirectories();
  if (matchDirs.length === 0) {
    return [];
  }

  const results = await Promise.all(
    matchDirs.map(async (matchDir) => {
      const summary = await readJsonFile<MatchSummaryRecord>(join(matchDir, "match_summary.json"));
      if (!summary) {
        return null;
      }
      const manifest = await readJsonFile<Record<string, unknown>>(
        join(matchDir, "match_manifest.json"),
      );
      const matchId = summary.matchId;
      return {
        matchId,
        scenarioName: resolveScenarioName(manifest),
        status: null,
        summary,
      } satisfies MatchListItem;
    }),
  );

  return results.filter(Boolean) as MatchListItem[];
}
