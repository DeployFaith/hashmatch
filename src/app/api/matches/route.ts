import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isSafeMatchId } from "@/engine/matchId";
import {
  readMatchStatus,
  resolveMatchDir,
  resolveMatchesRoot,
  type MatchLifecycleStatusRecord,
} from "@/server/matchLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MatchListEntry {
  matchId: string;
  status: MatchLifecycleStatusRecord["status"];
  scenario: string;
  agents: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

function extractStatusTimestamp(entry: MatchListEntry): number | null {
  const candidate = entry.finishedAt ?? entry.startedAt;
  if (!candidate) {
    return null;
  }
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function GET(): Promise<Response> {
  const root = resolveMatchesRoot();
  if (!existsSync(root)) {
    return NextResponse.json({ matches: [] });
  }

  let entries: MatchListEntry[] = [];
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    const matchDirs = dirents.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);

    const results = await Promise.all(
      matchDirs.map(async (matchId) => {
        if (!isSafeMatchId(matchId)) {
          return null;
        }
        const matchDir = resolveMatchDir(matchId);
        const status = await readMatchStatus(matchDir);
        if (!status) {
          return null;
        }
        return {
          matchId: status.matchId ?? matchId,
          status: status.status,
          scenario: status.scenario,
          agents: status.agents,
          startedAt: status.startedAt,
          finishedAt: status.finishedAt,
        } satisfies MatchListEntry;
      }),
    );

    entries = results.filter(Boolean) as MatchListEntry[];
  } catch {
    entries = [];
  }

  const ordered = entries
    .map((entry) => ({
      entry,
      timestamp: extractStatusTimestamp(entry),
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

  return NextResponse.json({ matches: ordered });
}
