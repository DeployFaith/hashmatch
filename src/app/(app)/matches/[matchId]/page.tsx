import Link from "next/link";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentCard } from "@/components/AgentCard";
import type {
  MatchDetailResponse,
  LiveMatchStatus,
  LiveMatchStatusResponse,
} from "@/lib/matches/types";
import { LiveMatchDetail } from "./live-match-detail";

async function fetchMatchDetail(matchId: string): Promise<MatchDetailResponse | null> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (!host) {
    return null;
  }
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  try {
    const response = await fetch(`${protocol}://${host}/api/matches/${matchId}`, {
      cache: "no-store",
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as MatchDetailResponse;
    return data ?? null;
  } catch {
    return null;
  }
}

async function fetchMatchStatus(
  matchId: string,
): Promise<{ status: LiveMatchStatus; meta: LiveMatchStatusResponse | null }> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (!host) {
    return { status: "finished", meta: null };
  }
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  try {
    const response = await fetch(`${protocol}://${host}/api/matches/${matchId}/status`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return { status: "finished", meta: null };
    }
    const data = (await response.json()) as LiveMatchStatusResponse;
    return { status: data.status, meta: data };
  } catch {
    return { status: "finished", meta: null };
  }
}

function normalizeStatusLabel(status: LiveMatchStatus): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "running":
      return "Running";
    case "finished":
      return "Completed";
    default:
      return "Unknown";
  }
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const match = await fetchMatchDetail(matchId);

  if (!match) {
    return (
      <div className="space-y-4">
        <Link
          href="/matches"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Back to matches
        </Link>
        <p className="text-sm text-muted-foreground">Match not found.</p>
      </div>
    );
  }

  // Fetch status to determine if match is live/waiting/finished
  const { status: runStatus, meta } = await fetchMatchStatus(matchId);

  // If running or waiting, delegate to the live client component
  if (runStatus === "running" || runStatus === "waiting") {
    return (
      <LiveMatchDetail
        matchId={matchId}
        initialMatch={match}
        initialRunStatus={runStatus}
        initialMeta={meta}
      />
    );
  }

  // Static server-rendered view for completed matches
  const verificationStatus = match.verification?.status;
  const verificationLabel =
    verificationStatus === "verified"
      ? "Verified"
      : verificationStatus === "failed"
        ? "Verification failed"
        : "Unverified";

  const statusLabel = normalizeStatusLabel(runStatus);

  return (
    <div className="space-y-6">
      <Link
        href="/matches"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to matches
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Match {match.matchId}</h1>
          <Badge
            variant="outline"
            className="border-green-500/40 text-green-400 text-[10px] uppercase tracking-wider"
          >
            {statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">Scenario: {match.scenarioName ?? "Unknown"}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Match Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                {statusLabel}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verification</dt>
              <dd className="mt-1">{verificationLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="mt-1">{match.summary.reason}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Turns</dt>
              <dd className="mt-1">{match.summary.turns}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Winner</dt>
              <dd className="mt-1">{match.summary.winner ?? "\u2014"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seed</dt>
              <dd className="mt-1 font-mono">{match.summary.seed}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {match.summary.agentIds.map((agentId) => {
              const profile = match.agentProfiles[agentId];
              return (
                <AgentCard
                  key={agentId}
                  name={agentId}
                  type={profile?.type}
                  record={profile?.record}
                  score={match.summary.scores[agentId] ?? null}
                  variant="expanded"
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {Object.entries(match.artifacts).map(([label, path]) => (
              <li key={label} className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide">{label}</span>
                <span className="font-mono text-foreground">{path}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
