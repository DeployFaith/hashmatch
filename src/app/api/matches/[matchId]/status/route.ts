import { NextResponse } from "next/server";
import { isSafeMatchId } from "@/engine/matchId";
import { readMatchStatus, resolveMatchDir } from "@/server/matchLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
): Promise<Response> {
  const { matchId } = await params;
  if (!isSafeMatchId(matchId)) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const matchDir = resolveMatchDir(matchId);
  const status = await readMatchStatus(matchDir);
  if (!status) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  return NextResponse.json(status);
}
