import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isSafeMatchId } from "@/engine/matchId";
import { findExhibitionMatchDirectory } from "@/server/exhibitionStorage";
import { getMatchStorageRoot } from "@/server/matchStorage";
import type {
  MatchRunStatusResponse,
  MatchStatusRecord,
  MatchSummaryRecord,
} from "@/lib/matches/types";

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

function mapRunStatus(status: MatchStatusRecord | null): MatchRunStatusResponse {
  if (!status) {
    return { status: "unknown" };
  }

  let normalized: MatchRunStatusResponse["status"] = "unknown";
  switch (status.status) {
    case "running":
      normalized = "running";
      break;
    case "complete":
    case "completed":
      normalized = "completed";
      break;
    case "failed":
    case "crashed":
    case "incomplete":
      normalized = "crashed";
      break;
    default:
      normalized = "unknown";
  }

  return {
    status: normalized,
    startedAt: status.startedAt,
    finishedAt: status.finishedAt ?? status.endedAt,
    exitCode: status.exitCode,
  };
}

async function resolveMatchDirectory(matchId: string): Promise<string | null> {
  const candidate = join(getMatchStorageRoot(), matchId);
  if (existsSync(candidate)) {
    const summary = await readJsonFile<MatchSummaryRecord>(join(candidate, "match_summary.json"));
    if (summary) {
      return candidate;
    }
  }

  return findExhibitionMatchDirectory(matchId);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
): Promise<Response> {
  const { matchId } = await params;
  if (!isSafeMatchId(matchId)) {
    return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
  }

  const matchDir = await resolveMatchDirectory(matchId);
  if (!matchDir) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const status = await readJsonFile<MatchStatusRecord>(join(matchDir, "match_status.json"));
  const response = mapRunStatus(status);
  return NextResponse.json(response);
}
