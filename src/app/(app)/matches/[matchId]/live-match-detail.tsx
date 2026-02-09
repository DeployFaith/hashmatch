"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentCard } from "@/components/AgentCard";
import { MomentsPanel } from "@/components/MomentsPanel";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
  WifiOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useMatchLive } from "@/hooks/useMatchLive";
import type { LiveViewerState } from "@/hooks/useMatchLive";
import type {
  MatchDetailResponse,
  LiveMatchStatus,
  LiveMatchStatusResponse,
} from "@/lib/matches/types";
import { redactEvent } from "@/lib/replay/redaction";
import type { RedactedEvent } from "@/lib/replay/redaction";
import { formatEvent } from "@/lib/replay/formatEvent";
import type { FormattedEvent } from "@/lib/replay/formatEvent";
import { detectMoments, buildMomentEventRangeMap } from "@/lib/replay/detectMoments";
import type { ReplayMoment, MomentEventRangeMap } from "@/lib/replay/detectMoments";
import type { ReplayEvent } from "@/lib/replay/parseJsonl";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LiveMatchDetailProps {
  matchId: string;
  initialMatch: MatchDetailResponse;
  initialRunStatus: LiveMatchStatus;
  initialMeta?: LiveMatchStatusResponse | null;
}

// ---------------------------------------------------------------------------
// Autoplay speeds
// ---------------------------------------------------------------------------

const AUTOPLAY_SPEEDS = [
  { label: "0.5x", ms: 2000 },
  { label: "1x", ms: 1000 },
  { label: "2x", ms: 500 },
  { label: "4x", ms: 250 },
  { label: "10x", ms: 100 },
] as const;

type SpeedIdx = 0 | 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Status indicator component
// ---------------------------------------------------------------------------

const stateConfig: Record<LiveViewerState, { label: string; className: string; pulse?: boolean }> =
  {
    waiting: {
      label: "Waiting",
      className: "border-yellow-500/40 text-yellow-400",
    },
    connecting: {
      label: "Connecting",
      className: "border-blue-500/40 text-blue-400",
    },
    live: {
      label: "\ud83d\udd34 LIVE",
      className: "border-red-500/40 text-red-400",
      pulse: true,
    },
    reconnecting: {
      label: "Reconnecting\u2026",
      className: "border-orange-500/40 text-orange-400",
    },
    completed: {
      label: "Match Complete",
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
      {state === "connecting" && <Loader2 className="h-3 w-3 animate-pulse" />}
      {state === "reconnecting" && <WifiOff className="h-3 w-3" />}
      {config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
      )}
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Event type colors
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Score extraction (reuses the same heuristic as detectMoments)
// ---------------------------------------------------------------------------

const SCORE_KEYS = ["scores", "score", "scoreboard", "points", "totals"] as const;

function extractScoresFromEvent(event: ReplayEvent): Record<string, number> | null {
  const raw = event.raw;

  for (const key of SCORE_KEYS) {
    if (key in raw && typeof raw[key] === "object" && raw[key] !== null) {
      const candidate = raw[key] as Record<string, unknown>;
      const entries = Object.entries(candidate).filter(
        ([, v]) => typeof v === "number" && Number.isFinite(v),
      );
      if (entries.length >= 2) {
        return Object.fromEntries(entries) as Record<string, number>;
      }
    }
  }

  // Check nested summary.scores or state.scores
  for (const wrapper of ["summary", "state"] as const) {
    if (wrapper in raw && typeof raw[wrapper] === "object" && raw[wrapper] !== null) {
      const nested = raw[wrapper] as Record<string, unknown>;
      for (const key of SCORE_KEYS) {
        if (key in nested && typeof nested[key] === "object" && nested[key] !== null) {
          const candidate = nested[key] as Record<string, unknown>;
          const entries = Object.entries(candidate).filter(
            ([, v]) => typeof v === "number" && Number.isFinite(v),
          );
          if (entries.length >= 2) {
            return Object.fromEntries(entries) as Record<string, number>;
          }
        }
      }
    }
  }

  return null;
}

function useLatestScores(events: ReplayEvent[]): Record<string, number> {
  return useMemo(() => {
    let latest: Record<string, number> = {};
    for (const event of events) {
      const scores = extractScoresFromEvent(event);
      if (scores) {
        latest = scores;
      }
    }
    return latest;
  }, [events]);
}

// ---------------------------------------------------------------------------
// Badge styles for formatted events
// ---------------------------------------------------------------------------

const badgeStyles: Record<FormattedEvent["badge"], string> = {
  action: "bg-primary/10 text-primary",
  wait: "bg-muted text-muted-foreground",
  invalid: "bg-destructive/10 text-destructive font-medium",
  system: "bg-muted text-muted-foreground italic",
  score: "bg-amber-500/10 text-amber-400",
  end: "bg-green-500/10 text-green-400 font-medium",
};

// ---------------------------------------------------------------------------
// Live event feed with auto-scroll
// ---------------------------------------------------------------------------

function LiveEventFeed({
  events,
  scenarioName,
  highlightIdx,
  onSelectEvent,
}: {
  events: RedactedEvent[];
  scenarioName: string;
  highlightIdx?: number;
  onSelectEvent?: (idx: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider "at bottom" if within 40px of the end
      shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 40;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (shouldAutoScroll.current && sentinelRef.current) {
      sentinelRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [events.length]);

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Waiting for events...</p>;
  }

  return (
    <div ref={containerRef} className="space-y-0.5 max-h-[600px] overflow-y-auto">
      {events.map((ev, idx) => {
        const formatted = formatEvent(ev.displayRaw, scenarioName);
        return (
          <div
            key={`${ev.matchId}-${ev.seq}`}
            onClick={() => onSelectEvent?.(idx)}
            className={cn(
              "flex flex-col gap-0.5 rounded px-2 py-1 text-xs transition-colors",
              onSelectEvent ? "cursor-pointer" : "",
              highlightIdx === idx
                ? "bg-primary/10 border border-primary/30"
                : "hover:bg-muted/50",
            )}
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-8 text-right font-mono text-muted-foreground">
                {ev.seq}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase",
                  badgeStyles[formatted.badge],
                )}
              >
                {formatted.badge}
              </span>
              {ev.turn !== undefined && (
                <span className="shrink-0 text-muted-foreground">T{ev.turn}</span>
              )}
              {ev.agentId && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {ev.agentId}
                </Badge>
              )}
              <span className="truncate">{formatted.primaryText}</span>
            </div>
            {formatted.details && (
              <div className="ml-10 text-[10px] text-muted-foreground truncate">
                {formatted.details}
              </div>
            )}
          </div>
        );
      })}
      <div ref={sentinelRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Replay controls (post-completion only)
// ---------------------------------------------------------------------------

function ReplayControls({
  playing,
  speedIdx,
  cursor,
  total,
  onPlayPause,
  onSpeedChange,
  onSeek,
  onStepBack,
  onStepForward,
  onJumpStart,
  onJumpEnd,
}: {
  playing: boolean;
  speedIdx: SpeedIdx;
  cursor: number;
  total: number;
  onPlayPause: () => void;
  onSpeedChange: (idx: SpeedIdx) => void;
  onSeek: (idx: number) => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onJumpStart: () => void;
  onJumpEnd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={cursor}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Event {cursor + 1} / {total}
        </span>
        <span>{AUTOPLAY_SPEEDS[speedIdx].label}</span>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={onJumpStart}
          className="rounded p-1.5 hover:bg-muted transition-colors"
          title="Jump to start"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onStepBack}
          className="rounded p-1.5 hover:bg-muted transition-colors"
          title="Step back"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={onPlayPause}
          className="rounded-full p-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={onStepForward}
          className="rounded p-1.5 hover:bg-muted transition-colors"
          title="Step forward"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          onClick={onJumpEnd}
          className="rounded p-1.5 hover:bg-muted transition-colors"
          title="Jump to end"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>

        {/* Speed buttons */}
        <div className="ml-4 flex items-center gap-1">
          {AUTOPLAY_SPEEDS.map((speed, idx) => (
            <button
              key={speed.label}
              onClick={() => onSpeedChange(idx as SpeedIdx)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-mono transition-colors",
                idx === speedIdx
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {speed.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification badge
// ---------------------------------------------------------------------------

function VerificationBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <Badge variant="outline" className="gap-1 border-green-500/40 text-green-400 text-[10px]">
        <CheckCircle2 className="h-3 w-3" />
        Verified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-red-500/40 text-red-400 text-[10px]">
      <XCircle className="h-3 w-3" />
      Verification Failed
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Live scoreboard
// ---------------------------------------------------------------------------

function LiveScoreboard({
  scores,
  agents,
  finalScores,
}: {
  scores: Record<string, number>;
  agents: string[];
  finalScores?: Record<string, number> | null;
}) {
  const displayScores = finalScores ?? scores;
  const agentList = agents.length > 0 ? agents : Object.keys(displayScores);

  if (agentList.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      {agentList.map((agentId, i) => (
        <div key={agentId} className="flex items-center gap-2">
          {i > 0 && <span className="text-xs text-muted-foreground font-medium">vs</span>}
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
              {agentId[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="text-sm font-medium truncate max-w-[120px]">{agentId}</span>
            <span className="font-mono font-bold text-sm">{displayScores[agentId] ?? 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waiting state view
// ---------------------------------------------------------------------------

function WaitingView({
  matchId,
  meta,
  match,
}: {
  matchId: string;
  meta: LiveMatchStatusResponse | null;
  match: MatchDetailResponse;
}) {
  const scenario = meta?.scenario ?? match.scenarioName ?? "Unknown";
  const agents = meta?.agents ?? match.summary.agentIds ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          Match Starting Soon...
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Match ID</dt>
            <dd className="mt-1 font-mono text-xs">{matchId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scenario</dt>
            <dd className="mt-1">{scenario}</dd>
          </div>
        </dl>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Agents</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {agents.map((agentId) => (
              <AgentCard key={agentId} name={agentId} variant="compact" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveMatchDetail({
  matchId,
  initialMatch,
  initialRunStatus,
  initialMeta,
}: LiveMatchDetailProps) {
  const { state, snapshot, eventCount, liveStatus, completeInfo, matchMeta } = useMatchLive(
    matchId,
    initialRunStatus,
  );

  // -- Replay state (post-completion) ----------------------------------------
  const [replayMode, setReplayMode] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState<SpeedIdx>(1);

  // -- Track final match data — reload when completed -------------------------
  const [finalMatch, setFinalMatch] = useState<MatchDetailResponse | null>(null);

  useEffect(() => {
    if (state !== "completed") {
      return;
    }
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

  // -- Get events from snapshot -----------------------------------------------
  const rawEvents: ReplayEvent[] = useMemo(() => {
    return snapshot?.events ?? [];
  }, [snapshot]);

  // -- Redact events for display ----------------------------------------------
  const isCompleted = state === "completed";
  const redactedEvents: RedactedEvent[] = useMemo(() => {
    return rawEvents.map((ev) =>
      redactEvent(ev, {
        mode: isCompleted ? "postMatch" : "spectator",
        revealSpoilers: isCompleted,
      }),
    );
  }, [rawEvents, isCompleted]);

  // -- Live scores (updated as events arrive) ---------------------------------
  const liveScores = useLatestScores(rawEvents);

  // -- Moment detection (post-completion only) --------------------------------
  const moments: ReplayMoment[] = useMemo(() => {
    if (!isCompleted || rawEvents.length === 0) {
      return [];
    }
    return detectMoments(rawEvents);
  }, [isCompleted, rawEvents]);

  const momentRanges: MomentEventRangeMap = useMemo(() => {
    return buildMomentEventRangeMap(moments, rawEvents);
  }, [moments, rawEvents]);

  // -- Transition to replay mode on completion --------------------------------
  useEffect(() => {
    if (state === "completed" && !replayMode) {
      setReplayMode(true);
      setCursor(redactedEvents.length > 0 ? redactedEvents.length - 1 : 0);
    }
  }, [state, replayMode, redactedEvents.length]);

  // -- Autoplay interval (replay mode) ----------------------------------------
  useEffect(() => {
    if (!playing || !replayMode) {
      return;
    }

    const intervalMs = AUTOPLAY_SPEEDS[speedIdx].ms;
    const interval = setInterval(() => {
      setCursor((prev) => {
        if (prev >= redactedEvents.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [playing, replayMode, speedIdx, redactedEvents.length]);

  // -- Keyboard shortcuts (replay mode only) ----------------------------------
  useEffect(() => {
    if (!replayMode) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          setPlaying((prev) => !prev);
          break;
        case "ArrowLeft":
          e.preventDefault();
          setPlaying(false);
          setCursor((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setPlaying(false);
          setCursor((prev) => Math.min(redactedEvents.length - 1, prev + 1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [replayMode, redactedEvents.length]);

  // -- Replay control handlers ------------------------------------------------
  const handlePlayPause = useCallback(() => setPlaying((p) => !p), []);
  const handleSeek = useCallback((idx: number) => {
    setPlaying(false);
    setCursor(idx);
  }, []);
  const handleStepBack = useCallback(() => {
    setPlaying(false);
    setCursor((prev) => Math.max(0, prev - 1));
  }, []);
  const handleStepForward = useCallback(() => {
    setPlaying(false);
    setCursor((prev) => Math.min(redactedEvents.length - 1, prev + 1));
  }, [redactedEvents.length]);
  const handleJumpStart = useCallback(() => {
    setPlaying(false);
    setCursor(0);
  }, []);
  const handleJumpEnd = useCallback(() => {
    setPlaying(false);
    setCursor(Math.max(0, redactedEvents.length - 1));
  }, [redactedEvents.length]);
  const handleMomentSelect = useCallback(
    (moment: ReplayMoment) => {
      const range = momentRanges.get(moment.id);
      if (range) {
        setPlaying(false);
        setCursor(range.startEventIdx);
      }
    },
    [momentRanges],
  );

  // -- Derived display values -------------------------------------------------
  const displayMatch = finalMatch ?? initialMatch;
  const isLive = state === "live" || state === "connecting" || state === "reconnecting";
  const isWaiting = state === "waiting";
  const isCrashed = state === "crashed";

  const currentTurn = liveStatus?.turn ?? matchMeta?.currentTurn ?? null;
  const totalTurns = liveStatus?.totalTurns ?? matchMeta?.totalTurns ?? null;

  const finalScores = completeInfo?.finalScores ?? null;
  const verified = completeInfo?.verified ?? null;

  const showVerification = isCompleted && verified !== null;

  return (
    <div className="space-y-6">
      <Link
        href="/matches"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to matches
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">Match {displayMatch.matchId}</h1>
            <LiveStatusBadge state={state} />
            {showVerification && <VerificationBadge verified={verified!} />}
          </div>
          <p className="text-sm text-muted-foreground">
            Scenario: {displayMatch.scenarioName ?? "Unknown"}
          </p>
        </div>
        {isLive && (
          <div className="text-right">
            {currentTurn !== null && totalTurns !== null && (
              <p className="text-sm font-mono">
                Turn {currentTurn} / {totalTurns}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{eventCount}</span> events
            </p>
          </div>
        )}
      </div>

      {/* Waiting state */}
      {isWaiting && (
        <WaitingView
          matchId={matchId}
          meta={matchMeta ?? initialMeta ?? null}
          match={displayMatch}
        />
      )}

      {/* Live scoreboard */}
      {(isLive || isCompleted) && Object.keys(liveScores).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scoreboard</CardTitle>
          </CardHeader>
          <CardContent>
            <LiveScoreboard
              scores={liveScores}
              agents={displayMatch.summary.agentIds}
              finalScores={finalScores}
            />
          </CardContent>
        </Card>
      )}

      {/* Replay controls (post-completion only) */}
      {replayMode && redactedEvents.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <ReplayControls
              playing={playing}
              speedIdx={speedIdx}
              cursor={cursor}
              total={redactedEvents.length}
              onPlayPause={handlePlayPause}
              onSpeedChange={setSpeedIdx}
              onSeek={handleSeek}
              onStepBack={handleStepBack}
              onStepForward={handleStepForward}
              onJumpStart={handleJumpStart}
              onJumpEnd={handleJumpEnd}
            />
          </CardContent>
        </Card>
      )}

      {/* Moments panel (post-completion only) */}
      {replayMode && moments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Key Moments</CardTitle>
          </CardHeader>
          <CardContent>
            <MomentsPanel
              moments={moments}
              momentRanges={momentRanges}
              onSelectMoment={handleMomentSelect}
              activeMomentId={null}
              spoilers={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Event stream */}
      {(isLive || isCompleted || (isCrashed && redactedEvents.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Event Stream
              {isLive && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LiveEventFeed
              events={redactedEvents}
              scenarioName={displayMatch.scenarioName ?? "unknown"}
              highlightIdx={replayMode ? cursor : undefined}
              onSelectEvent={replayMode ? handleSeek : undefined}
            />
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

      {/* Match summary */}
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
              <dd className="mt-1">
                {verified === true
                  ? "Verified \u2705"
                  : verified === false
                    ? "Verification Failed \u274c"
                    : isLive
                      ? "\u2014"
                      : (displayMatch.verification?.status ?? "Unverified")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="mt-1">
                {isLive ? "In progress" : (displayMatch.summary.reason ?? "\u2014")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Turns</dt>
              <dd className="mt-1">
                {isLive
                  ? currentTurn !== null && totalTurns !== null
                    ? `${currentTurn} / ${totalTurns}`
                    : `${eventCount} events`
                  : displayMatch.summary.turns}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Winner</dt>
              <dd className="mt-1">
                {isLive || isWaiting ? "\u2014" : (displayMatch.summary.winner ?? "\u2014")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seed</dt>
              <dd className="mt-1 font-mono">{displayMatch.summary.seed}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Agents */}
      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {displayMatch.summary.agentIds.map((agentId) => {
              const profile = displayMatch.agentProfiles[agentId];
              const score =
                finalScores?.[agentId] ??
                (isCompleted ? (displayMatch.summary.scores[agentId] ?? null) : null);
              return (
                <AgentCard
                  key={agentId}
                  name={agentId}
                  type={profile?.type}
                  record={profile?.record}
                  score={score}
                  variant="expanded"
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Match Records */}
      {!isLive && !isWaiting && (
        <Card>
          <CardHeader>
            <CardTitle>Match Records</CardTitle>
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
