"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentCard } from "@/components/AgentCard";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useMatchLive } from "@/hooks/useMatchLive";
import type { LiveViewerState } from "@/hooks/useMatchLive";
import type { MatchDetailResponse, MatchRunState } from "@/lib/matches/types";
import { redactEvent } from "@/lib/replay/redaction";
import type { RedactedEvent } from "@/lib/replay/redaction";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LiveMatchDetailProps {
  matchId: string;
  initialMatch: MatchDetailResponse;
  initialRunStatus: MatchRunState;
}

// ---------------------------------------------------------------------------
// Status indicator component
// ---------------------------------------------------------------------------

const stateConfig: Record<LiveViewerState, { label: string; className: string; pulse?: boolean }> =
  {
    connecting: {
      label: "Connecting",
      className: "border-blue-500/40 text-blue-400",
    },
    live: {
      label: "Live",
      className: "border-emerald-500/40 text-emerald-400",
      pulse: true,
    },
    completed: {
      label: "Completed",
      className: "border-green-500/40 text-green-400",
    },
    crashed: {
      label: "Crashed",
      className: "border-destructive/50 text-destructive",
    },
    unknown: {
      label: "Unknown",
      className: "border-muted-foreground/40 text-muted-foreground",
    },
  };

function LiveStatusBadge({ state }: { state: LiveViewerState }) {
  const config = stateConfig[state];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 text-[10px] uppercase tracking-wider", config.className)}
    >
      {(state === "connecting" || state === "live") && (
        <Loader2 className={cn("h-3 w-3", state === "live" ? "animate-spin" : "animate-pulse")} />
      )}
      {config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      )}
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Event type colors
// ---------------------------------------------------------------------------

const typeColors: Record<string, string> = {
  MatchStarted: "text-blue-400",
  MatchEnded: "text-green-400",
  TurnStarted: "text-muted-foreground",
  ObservationEmitted: "text-purple-400",
  ActionSubmitted: "text-amber-400",
  ActionAdjudicated: "text-green-400",
  StateUpdated: "text-muted-foreground",
  AgentError: "text-destructive",
};

// ---------------------------------------------------------------------------
// Live event feed (lightweight — shows events as they arrive)
// ---------------------------------------------------------------------------

function LiveEventFeed({ events }: { events: RedactedEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Waiting for events...</p>;
  }

  return (
    <div className="space-y-1 max-h-[600px] overflow-y-auto">
      {events.map((ev) => (
        <div
          key={`${ev.matchId}-${ev.seq}`}
          className="flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
        >
          <span className="shrink-0 w-8 text-right font-mono text-muted-foreground">{ev.seq}</span>
          <span className={cn("shrink-0 w-36 font-mono font-medium", typeColors[ev.type])}>
            {ev.type}
          </span>
          {ev.turn !== undefined && (
            <span className="shrink-0 text-muted-foreground">T{ev.turn}</span>
          )}
          {ev.agentId && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {ev.agentId}
            </Badge>
          )}
          <span className="truncate text-muted-foreground">{ev.summary}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveMatchDetail({ matchId, initialMatch, initialRunStatus }: LiveMatchDetailProps) {
  const { state, snapshot, eventCount } = useMatchLive(matchId, initialRunStatus);

  // Track final match data — reload when completed
  const [finalMatch, setFinalMatch] = useState<MatchDetailResponse | null>(null);

  useEffect(() => {
    if (state !== "completed") {
      return;
    }
    // Fetch fresh match detail after completion
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}`);
        if (res.ok) {
          const data = (await res.json()) as MatchDetailResponse;
          if (!cancelled) {
            setFinalMatch(data);
          }
        }
      } catch {
        // Ignore — will show partial data
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [state, matchId]);

  // Redact events for display (spectator mode, no spoilers during live)
  const redactedEvents: RedactedEvent[] = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.events.map((ev) =>
      redactEvent(ev, { mode: "spectator", revealSpoilers: false }),
    );
  }, [snapshot]);

  const displayMatch = finalMatch ?? initialMatch;
  const isLive = state === "connecting" || state === "live";
  const isCrashed = state === "crashed";

  // -- Static completed view (reused for both completed and final data) ------

  const verificationStatus = displayMatch.verification?.status;
  const verificationLabel =
    verificationStatus === "verified"
      ? "Verified"
      : verificationStatus === "failed"
        ? "Verification failed"
        : "Unverified";

  return (
    <div className="space-y-6">
      <Link
        href="/matches"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to matches
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">Match {displayMatch.matchId}</h1>
            <LiveStatusBadge state={state} />
          </div>
          <p className="text-sm text-muted-foreground">
            Scenario: {displayMatch.scenarioName ?? "Unknown"}
          </p>
        </div>
        {isLive && (
          <div className="text-right text-xs text-muted-foreground">
            <span className="font-mono">{eventCount}</span> events received
          </div>
        )}
      </div>

      {/* Live event feed */}
      {(isLive || (isCrashed && redactedEvents.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Event Stream
              {isLive && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LiveEventFeed events={redactedEvents} />
          </CardContent>
        </Card>
      )}

      {/* Crashed banner */}
      {isCrashed && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <div>
            <p className="font-medium">Match crashed</p>
            <p className="text-xs">
              The match process terminated unexpectedly.
              {redactedEvents.length > 0
                ? ` ${redactedEvents.length} partial events are shown above.`
                : " No events were captured."}
            </p>
          </div>
        </div>
      )}

      {/* Match summary — always shown, uses latest data */}
      <Card>
        <CardHeader>
          <CardTitle>Match Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <LiveStatusBadge state={state} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verification</dt>
              <dd className="mt-1">{verificationLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="mt-1">{isLive ? "In progress" : displayMatch.summary.reason}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Turns</dt>
              <dd className="mt-1">
                {isLive ? `${eventCount} events` : displayMatch.summary.turns}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Winner</dt>
              <dd className="mt-1">
                {isLive ? "\u2014" : (displayMatch.summary.winner ?? "\u2014")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seed</dt>
              <dd className="mt-1 font-mono">{displayMatch.summary.seed}</dd>
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
            {displayMatch.summary.agentIds.map((agentId) => {
              const profile = displayMatch.agentProfiles[agentId];
              return (
                <AgentCard
                  key={agentId}
                  name={agentId}
                  type={profile?.type}
                  record={profile?.record}
                  score={isLive ? null : (displayMatch.summary.scores[agentId] ?? null)}
                  variant="expanded"
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Artifacts — only show when not live (artifacts appear after completion) */}
      {!isLive && (
        <Card>
          <CardHeader>
            <CardTitle>Artifacts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {Object.entries(displayMatch.artifacts).map(([label, path]) => (
                <li key={label} className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide">{label}</span>
                  <span className="font-mono text-foreground">{path}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
