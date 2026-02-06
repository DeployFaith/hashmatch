"use client";

import { useAppStore } from "@/lib/store";
import { StatusCard } from "@/components/status-card";
import { EventFeed } from "@/components/event-feed";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Swords, Users, Activity, AlertTriangle } from "lucide-react";
import Link from "next/link";

function formatUtcTimestamp(input: string | number | Date): string {
  const d = new Date(input);
  const pad2 = (n: number) => String(n).padStart(2, "0");

  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(
    d.getUTCHours(),
  )}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
}

export default function ArenaPage() {
  const { matches, agents, events } = useAppStore();

  const activeMatches = matches.filter((m) => m.status === "in_progress");
  const completedMatches = matches.filter((m) => m.status === "completed");
  const errorEvents = events.filter((e) => e.severity === "error" || e.severity === "critical");
  const featuredMatch = activeMatches[0] || matches[0];

  const recentEvents = [...events]
  .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  .slice(0, 10);

  const featuredStartedText = featuredMatch?.startedAt
  ? formatUtcTimestamp(featuredMatch.startedAt)
  : undefined;

  return (
    <div className="space-y-6">
    <div>
    <h1 className="text-lg font-bold">Arena</h1>
    <p className="text-sm text-muted-foreground">System overview and live match status</p>
    </div>

    {/* Status cards */}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatusCard label="Active Matches" value={activeMatches.length} icon={Swords} />
    <StatusCard label="Registered Agents" value={agents.length} icon={Users} />
    <StatusCard
    label="Completed Matches"
    value={completedMatches.length}
    icon={Activity}
    trend="up"
    />
    <StatusCard
    label="Incidents"
    value={errorEvents.length}
    icon={AlertTriangle}
    trend={errorEvents.length > 0 ? "down" : "neutral"}
    />
    </div>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    {/* Featured Match */}
    {featuredMatch && (
      <Card>
      <CardHeader>
      <div className="flex items-center justify-between">
      <CardTitle>Featured Match</CardTitle>
      <MatchStatusBadge status={featuredMatch.status} />
      </div>
      </CardHeader>
      <CardContent>
      <Link
      href={`/matches/${featuredMatch.id}`}
      className="block space-y-2 text-sm hover:text-primary transition-colors"
      >
      <p className="font-medium">{featuredMatch.title}</p>
      <p className="text-muted-foreground">
      {featuredMatch.agents.length} agents · {featuredMatch.episodes.length} episodes
      </p>
      {featuredStartedText && (
        <p className="text-xs text-muted-foreground">Started {featuredStartedText}</p>
      )}
      </Link>
      </CardContent>
      </Card>
    )}

    {/* Recent matches */}
    <Card>
    <CardHeader>
    <CardTitle>Recent Matches</CardTitle>
    </CardHeader>
    <CardContent>
    <div className="space-y-2">
    {matches.slice(0, 5).map((match) => (
      <Link
      key={match.id}
      href={`/matches/${match.id}`}
      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
      >
      <span className="font-medium">{match.title}</span>
      <MatchStatusBadge status={match.status} />
      </Link>
    ))}
    </div>
    </CardContent>
    </Card>
    </div>

    {/* Event feed */}
    <Card>
    <CardHeader>
    <CardTitle>Recent Events</CardTitle>
    </CardHeader>
    <CardContent>
    <EventFeed events={recentEvents} />
    </CardContent>
    </Card>
    </div>
  );
}
