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
  FolderOpen,
  ArrowLeft,
  Loader2,
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

/** Shape of tournament.json written by the artifact writer. */
interface TournamentMeta {
  tournamentSeed: number;
  scenarioName: string;
  agents: string[];
  matches: Array<{
    matchKey: string;
    seed: number;
    scenarioName: string;
    agentIds: string[];
    maxTurns: number;
  }>;
}

/** Shape of each matches/<key>/match_summary.json. */
interface MatchSummaryEntry {
  matchId: string;
  matchKey: string;
  seed: number;
  agentIds: string[];
  scores: Record<string, number>;
  winner: string | null;
  turns: number;
  reason: string;
}

/** Shape of each row in standings.json. */
interface StandingsEntry {
  agentId: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
}

/** Loaded tournament data held in state. */
interface TournamentData {
  tournament: TournamentMeta;
  standings: StandingsEntry[];
  matchSummaries: MatchSummaryEntry[];
  dirHandle: FileSystemDirectoryHandle;
}

/** Discriminated union for the page state machine. */
type PageState =
  | { mode: "idle" }
  | { mode: "single"; events: ReplayEvent[]; errors: ParseError[]; filename: string }
  | { mode: "tournament"; data: TournamentData }
  | {
      mode: "tournamentMatch";
      data: TournamentData;
      matchKey: string;
      events: ReplayEvent[];
      errors: ParseError[];
    };

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
// File System Access API helpers
// ---------------------------------------------------------------------------

function hasDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  // showDirectoryPicker may not be in all TS DOM type declarations
  type WindowWithPicker = Window & {
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
  };
  return (window as unknown as WindowWithPicker).showDirectoryPicker();
}

/** Read a text file from a directory handle by path segments. */
async function readTextFile(
  dirHandle: FileSystemDirectoryHandle,
  ...path: string[]
): Promise<string> {
  let current: FileSystemDirectoryHandle = dirHandle;
  for (let i = 0; i < path.length - 1; i++) {
    current = await current.getDirectoryHandle(path[i]);
  }
  const fileHandle = await current.getFileHandle(path[path.length - 1]);
  const file = await fileHandle.getFile();
  return file.text();
}

/** Parse a JSON file from a directory, returning a typed result. */
async function readJsonFile<T>(
  dirHandle: FileSystemDirectoryHandle,
  ...path: string[]
): Promise<T> {
  const text = await readTextFile(dirHandle, ...path);
  return JSON.parse(text) as T;
}

/** Load all tournament data from a directory handle. */
async function loadTournamentDir(
  dirHandle: FileSystemDirectoryHandle,
): Promise<TournamentData> {
  const tournament = await readJsonFile<TournamentMeta>(dirHandle, "tournament.json");
  const standings = await readJsonFile<StandingsEntry[]>(dirHandle, "standings.json");

  // Use the matches list from tournament.json to enumerate match summaries
  const matchSummaries: MatchSummaryEntry[] = [];
  for (const spec of tournament.matches) {
    try {
      const summary = await readJsonFile<MatchSummaryEntry>(
        dirHandle,
        "matches",
        spec.matchKey,
        "match_summary.json",
      );
      matchSummaries.push(summary);
    } catch {
      // Skip matches without a summary file
    }
  }

  return { tournament, standings, matchSummaries, dirHandle };
}

/** Load a single match's JSONL from the tournament directory. */
async function loadMatchFromDir(
  dirHandle: FileSystemDirectoryHandle,
  matchKey: string,
): Promise<{ events: ReplayEvent[]; errors: ParseError[] }> {
  const text = await readTextFile(dirHandle, "matches", matchKey, "match.jsonl");
  return parseJsonl(text);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FileDropZone({
  onLoad,
  onTournamentLoad,
}: {
  onLoad: (text: string, filename: string) => void;
  onTournamentLoad: (data: TournamentData) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentError, setTournamentError] = useState<string | null>(null);

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

  const handleTournamentFolder = useCallback(async () => {
    setTournamentError(null);
    setTournamentLoading(true);
    try {
      const dirHandle = await pickDirectory();
      const data = await loadTournamentDir(dirHandle);
      onTournamentLoad(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled the picker
      } else if (err instanceof Error) {
        setTournamentError(err.message);
      } else {
        setTournamentError("Failed to load tournament folder");
      }
    } finally {
      setTournamentLoading(false);
    }
  }, [onTournamentLoad]);

  const directoryPickerAvailable = hasDirectoryPicker();

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

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {directoryPickerAvailable ? (
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleTournamentFolder}
              disabled={tournamentLoading}
            >
              {tournamentLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              Load tournament folder
            </Button>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground text-center">
              <p className="font-medium mb-1">Tournament folder loading unavailable</p>
              <p>
                The File System Access API is required. Use Chrome or Edge, or load a single match
                JSONL file instead.
              </p>
            </div>
          )}

          {tournamentError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs">{tournamentError}</p>
            </div>
          )}
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
// Tournament browser
// ---------------------------------------------------------------------------

function TournamentBrowser({
  data,
  onSelectMatch,
  onClose,
}: {
  data: TournamentData;
  onSelectMatch: (matchKey: string) => void;
  onClose: () => void;
}) {
  const [spoilers, setSpoilers] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState<string | null>(null);

  const { tournament, standings, matchSummaries } = data;

  // Build a lookup from matchKey → summary
  const summaryByKey = useMemo(() => {
    const map = new Map<string, MatchSummaryEntry>();
    for (const s of matchSummaries) {
      map.set(s.matchKey, s);
    }
    return map;
  }, [matchSummaries]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Tournament: {tournament.scenarioName}
          </p>
          <p className="text-xs text-muted-foreground">
            Seed {tournament.tournamentSeed} · {tournament.agents.length} agents ·{" "}
            {tournament.matches.length} matches
          </p>
        </div>

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

      {/* Standings (only shown when spoilers ON) */}
      {spoilers && standings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4" />
              Standings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">#</th>
                    <th className="pb-2 pr-4 font-medium">Agent</th>
                    <th className="pb-2 pr-4 font-medium text-right">Pts</th>
                    <th className="pb-2 pr-4 font-medium text-right">W</th>
                    <th className="pb-2 pr-4 font-medium text-right">D</th>
                    <th className="pb-2 pr-4 font-medium text-right">L</th>
                    <th className="pb-2 font-medium text-right">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => (
                    <tr key={row.agentId} className="border-b border-border/50">
                      <td className="py-1.5 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-4 font-medium">{row.agentId}</td>
                      <td className="py-1.5 pr-4 text-right">
                        <Badge variant="default">{row.points}</Badge>
                      </td>
                      <td className="py-1.5 pr-4 text-right">{row.wins}</td>
                      <td className="py-1.5 pr-4 text-right">{row.draws}</td>
                      <td className="py-1.5 pr-4 text-right">{row.losses}</td>
                      <td className="py-1.5 text-right">
                        <span className={row.scoreDiff > 0 ? "text-success" : "text-muted-foreground"}>
                          {row.scoreDiff > 0 ? "+" : ""}
                          {row.scoreDiff}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!spoilers && (
        <p className="text-xs text-muted-foreground italic text-center">
          Enable spoilers to reveal standings
        </p>
      )}

      {/* Match list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Matches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Match</th>
                  <th className="pb-2 pr-4 font-medium">Agents</th>
                  <th className="pb-2 pr-4 font-medium">Scenario</th>
                  <th className="pb-2 pr-4 font-medium text-right">Turns</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  {spoilers && <th className="pb-2 pr-4 font-medium">Winner</th>}
                  {spoilers && <th className="pb-2 font-medium">Scores</th>}
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {tournament.matches.map((spec) => {
                  const summary = summaryByKey.get(spec.matchKey);
                  const turns = summary?.turns ?? "?";
                  const reason = summary?.reason ?? "unknown";
                  const isLoading = loadingMatch === spec.matchKey;

                  return (
                    <tr key={spec.matchKey} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-muted-foreground">
                        {spec.matchKey}
                      </td>
                      <td className="py-2 pr-4">
                        {spec.agentIds.join(" vs ")}
                      </td>
                      <td className="py-2 pr-4">{spec.scenarioName}</td>
                      <td className="py-2 pr-4 text-right">{turns}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={reason === "completed" ? "success" : "secondary"}
                        >
                          {reason}
                        </Badge>
                      </td>
                      {spoilers && (
                        <td className="py-2 pr-4">
                          {summary?.winner ? (
                            <Badge variant="info">{summary.winner}</Badge>
                          ) : (
                            <span className="text-muted-foreground">draw</span>
                          )}
                        </td>
                      )}
                      {spoilers && (
                        <td className="py-2 pr-4 font-mono">
                          {summary
                            ? Object.entries(summary.scores)
                                .map(([id, s]) => `${id}: ${s}`)
                                .join(", ")
                            : "—"}
                        </td>
                      )}
                      <td className="py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => {
                            setLoadingMatch(spec.matchKey);
                            onSelectMatch(spec.matchKey);
                          }}
                        >
                          {isLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          Watch
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
  onBack,
}: {
  events: ReplayEvent[];
  errors: ParseError[];
  filename: string;
  onClose: () => void;
  /** If provided, shows a "Back to tournament list" button. */
  onBack?: () => void;
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
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to tournament
          </Button>
        )}

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

        {!onBack && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
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
  const [state, setState] = useState<PageState>({ mode: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSingleLoad = useCallback((text: string, filename: string) => {
    const result = parseJsonl(text);
    if (result.events.length === 0 && result.errors.length > 0) {
      setState({ mode: "idle" });
      setLoadError(
        result.errors
          .slice(0, 10)
          .map((e) => `Line ${e.line}: ${e.message}`)
          .join("\n"),
      );
    } else {
      setLoadError(null);
      setState({
        mode: "single",
        events: result.events,
        errors: result.errors,
        filename,
      });
    }
  }, []);

  const handleTournamentLoad = useCallback((data: TournamentData) => {
    setLoadError(null);
    setState({ mode: "tournament", data });
  }, []);

  const handleMatchSelect = useCallback(
    async (matchKey: string) => {
      if (state.mode !== "tournament") {
        return;
      }
      try {
        const { events, errors } = await loadMatchFromDir(state.data.dirHandle, matchKey);
        if (events.length === 0) {
          setLoadError(`No valid events found in match ${matchKey}`);
          return;
        }
        setLoadError(null);
        setState({
          mode: "tournamentMatch",
          data: state.data,
          matchKey,
          events,
          errors,
        });
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? `Failed to load match ${matchKey}: ${err.message}`
            : `Failed to load match ${matchKey}`,
        );
      }
    },
    [state],
  );

  // Idle mode: show loaders
  if (state.mode === "idle") {
    return (
      <div className="space-y-4">
        <FileDropZone onLoad={handleSingleLoad} onTournamentLoad={handleTournamentLoad} />
        {loadError && (
          <div className="mx-auto max-w-xl">
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Failed to parse replay</p>
                <pre className="mt-1 text-xs whitespace-pre-wrap">{loadError}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Single JSONL mode
  if (state.mode === "single") {
    return (
      <ReplayViewer
        events={state.events}
        errors={state.errors}
        filename={state.filename}
        onClose={() => {
          setLoadError(null);
          setState({ mode: "idle" });
        }}
      />
    );
  }

  // Tournament browser mode
  if (state.mode === "tournament") {
    return (
      <div className="space-y-4">
        <TournamentBrowser
          data={state.data}
          onSelectMatch={handleMatchSelect}
          onClose={() => {
            setLoadError(null);
            setState({ mode: "idle" });
          }}
        />
        {loadError && (
          <div className="mx-auto max-w-2xl">
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs">{loadError}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tournament match viewer mode
  if (state.mode === "tournamentMatch") {
    return (
      <ReplayViewer
        events={state.events}
        errors={state.errors}
        filename={`${state.matchKey} — match.jsonl`}
        onClose={() => {
          setLoadError(null);
          setState({ mode: "idle" });
        }}
        onBack={() => {
          setLoadError(null);
          setState({ mode: "tournament", data: state.data });
        }}
      />
    );
  }

  // Exhaustive check
  return null;
}
