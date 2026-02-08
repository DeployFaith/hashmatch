import Link from "next/link";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MatchDetailResponse } from "@/lib/matches/types";

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

export default async function MatchDetailPage({
  params,
}: {
  params: { matchId: string };
}) {
  const match = await fetchMatchDetail(params.matchId);

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

  return (
    <div className="space-y-6">
      <Link
        href="/matches"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to matches
      </Link>

      <div>
        <h1 className="text-lg font-bold">Match {match.matchId}</h1>
        <p className="text-sm text-muted-foreground">
          Scenario: {match.scenarioName ?? "Unknown"}
        </p>
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
                {match.status?.status ?? "unknown"}
              </dd>
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
          <div className="flex flex-wrap gap-2">
            {match.summary.agentIds.map((agentId) => (
              <Badge key={agentId} variant="outline" className="text-xs">
                {agentId}
              </Badge>
            ))}
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
                <span className="uppercase tracking-wide text-xs">{label}</span>
                <span className="font-mono text-foreground">{path}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
