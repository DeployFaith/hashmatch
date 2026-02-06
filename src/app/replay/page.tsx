"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import {
  Upload,
  FileText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseJsonl } from "@/lib/replay/parseJsonl";
import type { ReplayEvent, ParseError } from "@/lib/replay/parseJsonl";
import { SAMPLE_JSONL } from "@/lib/replay/fixtures/sampleNumberGuess";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TurnGroup {
  label: string;
  turn: number | null;
  events: ReplayEvent[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByTurn(events: ReplayEvent[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup | null = null;

  for (const ev of events) {
    const turn = ev.turn ?? null;
    if (current === null || current.turn !== turn) {
      current = {
        label: turn !== null ? `Turn ${turn}` : "No turn",
        turn,
        events: [],
      };
      groups.push(current);
    }
    current.events.push(ev);
  }

  // Ensure "No turn" events that precede turns stay grouped at top
  // They already are in seq order from parser, so this is fine.
  return groups;
}

function compactSummary(ev: ReplayEvent): string {
  const raw = ev.raw;
  switch (ev.type) {
    case "MatchStarted":
      return `${raw.scenarioName} — ${(raw.agentIds as string[])?.join(" vs ")}`;
    case "TurnStarted":
      return `Turn ${ev.turn} started`;
    case "ObservationEmitted":
      return `Observation → ${ev.agentId}`;
    case "ActionSubmitted":
      return `Action ← ${ev.agentId}`;
    case "ActionAdjudicated":
      return `${raw.valid ? "Valid" : "INVALID"} — ${ev.agentId}`;
    case "StateUpdated":
      return "State updated";
    case "AgentError":
      return `Error: ${ev.agentId}`;
    case "MatchEnded":
      return "Match ended";
    default:
      return ev.type;
  }
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Redact spoiler fields from a MatchEnded event for display. */
function redactMatchEnded(raw: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...raw };
  redacted.scores = "[hidden — enable spoilers]";
  redacted.details = "[hidden — enable spoilers]";
  if ("reason" in redacted) {
    redacted.reason = "[hidden — enable spoilers]";
  }
  return redacted;
}

const typeColors: Record<string, string> = {
  MatchStarted: "text-info",
  MatchEnded: "text-success",
  TurnStarted: "text-muted-foreground",
  ObservationEmitted: "text-primary",
  ActionSubmitted: "text-warning",
  ActionAdjudicated: "text-success",
  StateUpdated: "text-muted-foreground",
  AgentError: "text-destructive",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FileDropZone({ onLoad }: { onLoad: (text: string, filename: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === "string") {
          onLoad(text, file.name);
        }
      };
      reader.readAsText(file);
    },
    [onLoad],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleSample = useCallback(() => {
    const blob = new Blob([SAMPLE_JSONL], { type: "text/plain" });
    const file = new File([blob], "sample-number-guess.jsonl", { type: "text/plain" });
    handleFile(file);
  }, [handleFile]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-bold">Replay Viewer</h1>
        <p className="text-sm text-muted-foreground">
          Load a JSONL engine log and explore the match timeline
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">Drop a .jsonl replay file here</p>
            <p className="mb-3 text-xs text-muted-foreground">or click below to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jsonl"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  handleFile(f);
                }
              }}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileText className="h-4 w-4" />
              Choose file
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="secondary" className="w-full" onClick={handleSample}>
            <FileText className="h-4 w-4" />
            Load sample replay (Number Guess)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Scoreboard({ events, spoilers }: { events: ReplayEvent[]; spoilers: boolean }) {
  const matchEnded = events.find((e) => e.type === "MatchEnded");
  const matchStarted = events.find((e) => e.type === "MatchStarted");
  const agentIds: string[] = matchStarted ? ((matchStarted.raw.agentIds as string[]) ?? []) : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Scoreboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!matchEnded || !spoilers ? (
          <div className="space-y-2">
            {agentIds.map((id) => (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{id}</span>
                <span className="text-muted-foreground">
                  {spoilers && !matchEnded ? "In progress" : "Unknown until end"}
                </span>
              </div>
            ))}
            {!spoilers && matchEnded && (
              <p className="text-xs text-muted-foreground italic">
                Enable spoilers to reveal scores
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(matchEnded.raw.scores as Record<string, number>).map(([id, score]) => (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{id}</span>
                <Badge variant={score > 0 ? "success" : "secondary"}>{score}</Badge>
              </div>
            ))}
            {typeof matchEnded.raw.reason === "string" && (
              <p className="text-xs text-muted-foreground">Reason: {matchEnded.raw.reason}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventCard({
  event,
  isSelected,
  onClick,
  spoilers,
}: {
  event: ReplayEvent;
  isSelected: boolean;
  onClick: () => void;
  spoilers: boolean;
}) {
  const isSpoiler = event.type === "MatchEnded" && !spoilers;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border px-3 py-2 text-xs transition-colors",
        isSelected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted-foreground">{event.seq}</span>
        <span className={cn("font-medium", typeColors[event.type])}>{event.type}</span>
        {event.agentId && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {event.agentId}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-muted-foreground truncate">
        {isSpoiler ? "Match ended [spoiler hidden]" : compactSummary(event)}
      </p>
    </button>
  );
}

function EventDetail({ event, spoilers }: { event: ReplayEvent | null; spoilers: boolean }) {
  if (!event) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an event from the timeline
      </div>
    );
  }

  const displayRaw =
    event.type === "MatchEnded" && !spoilers ? redactMatchEnded(event.raw) : event.raw;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="info">{event.type}</Badge>
        <span className="font-mono text-xs text-muted-foreground">seq {event.seq}</span>
        {event.agentId && <Badge variant="outline">{event.agentId}</Badge>}
        {event.turn !== undefined && (
          <span className="text-xs text-muted-foreground">turn {event.turn}</span>
        )}
      </div>
      <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
        {prettyJson(displayRaw)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main viewer
// ---------------------------------------------------------------------------

function ReplayViewer({
  events,
  errors,
  filename,
  onClose,
}: {
  events: ReplayEvent[];
  errors: ParseError[];
  filename: string;
  onClose: () => void;
}) {
  const [spoilers, setSpoilers] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const groups = useMemo(() => groupByTurn(events), [events]);

  // Flat index → event mapping (for prev/next navigation)
  const selectedEvent = events[selectedIdx] ?? null;

  // Current turn for the turn selector
  const currentTurn = selectedEvent?.turn ?? null;
  const turnNumbers = useMemo(() => {
    const turns = new Set<number>();
    for (const ev of events) {
      if (ev.turn !== undefined) {
        turns.add(ev.turn);
      }
    }
    return Array.from(turns).sort((a, b) => a - b);
  }, [events]);

  const jumpToTurn = useCallback(
    (turn: number) => {
      const idx = events.findIndex((e) => e.turn === turn);
      if (idx >= 0) {
        setSelectedIdx(idx);
      }
    },
    [events],
  );

  const prevEvent = () => setSelectedIdx((i) => Math.max(0, i - 1));
  const nextEvent = () => setSelectedIdx((i) => Math.min(events.length - 1, i + 1));
  const firstEvent = () => setSelectedIdx(0);
  const lastEvent = () => setSelectedIdx(events.length - 1);

  return (
    <div className="flex h-[calc(100vh-theme(spacing.14)-theme(spacing.12))] flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{filename}</p>
          <p className="text-xs text-muted-foreground">
            {events.length} events
            {errors.length > 0 && (
              <span className="text-warning"> · {errors.length} parse errors</span>
            )}
          </p>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={firstEvent} disabled={selectedIdx === 0}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={prevEvent} disabled={selectedIdx === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[4rem] text-center text-xs font-mono text-muted-foreground">
            {selectedIdx + 1} / {events.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={nextEvent}
            disabled={selectedIdx === events.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={lastEvent}
            disabled={selectedIdx === events.length - 1}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Turn selector */}
        {turnNumbers.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Turn:</span>
            <select
              value={currentTurn ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== "") {
                  jumpToTurn(Number(val));
                }
              }}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            >
              <option value="">—</option>
              {turnNumbers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Spoilers toggle */}
        <Button
          variant={spoilers ? "destructive" : "outline"}
          size="sm"
          onClick={() => setSpoilers((s) => !s)}
        >
          {spoilers ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Spoilers {spoilers ? "ON" : "OFF"}
        </Button>

        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Parse errors */}
      {errors.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">Parse warnings ({errors.length})</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {errors.slice(0, 5).map((err, i) => (
                <li key={i}>
                  Line {err.line}: {err.message}
                </li>
              ))}
              {errors.length > 5 && <li>... and {errors.length - 5} more</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Main 3-panel layout */}
      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Left: Timeline grouped by turn */}
        <div className="w-72 shrink-0 overflow-y-auto rounded-md border border-border bg-card p-3">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Timeline
          </h2>
          <div className="space-y-4">
            {groups.map((group, gi) => (
              <div key={gi}>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
                <div className="space-y-1">
                  {group.events.map((ev) => {
                    const flatIdx = events.indexOf(ev);
                    return (
                      <EventCard
                        key={ev.seq}
                        event={ev}
                        isSelected={flatIdx === selectedIdx}
                        onClick={() => setSelectedIdx(flatIdx)}
                        spoilers={spoilers}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Event detail + Scoreboard */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          {/* Event detail */}
          <div className="flex-1 overflow-y-auto rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Event Detail
            </h2>
            <EventDetail event={selectedEvent} spoilers={spoilers} />
          </div>

          {/* Scoreboard */}
          <div className="shrink-0">
            <Scoreboard events={events} spoilers={spoilers} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReplayPage() {
  const [loaded, setLoaded] = useState<{
    events: ReplayEvent[];
    errors: ParseError[];
    filename: string;
  } | null>(null);

  const handleLoad = useCallback((text: string, filename: string) => {
    const result = parseJsonl(text);
    setLoaded({ events: result.events, errors: result.errors, filename });
  }, []);

  if (!loaded || loaded.events.length === 0) {
    return (
      <div className="space-y-4">
        <FileDropZone onLoad={handleLoad} />
        {loaded && loaded.events.length === 0 && loaded.errors.length > 0 && (
          <div className="mx-auto max-w-xl">
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Failed to parse replay</p>
                <ul className="mt-1 text-xs space-y-0.5">
                  {loaded.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>
                      Line {err.line}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <ReplayViewer
      events={loaded.events}
      errors={loaded.errors}
      filename={loaded.filename}
      onClose={() => setLoaded(null)}
    />
  );
}
