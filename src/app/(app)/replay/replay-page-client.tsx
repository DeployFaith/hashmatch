"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  Info,
  ShieldAlert,
  Filter,
  MessageSquare,
  Play,
  Pause,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentCard } from "@/components/AgentCard";
import { MomentsPanel } from "@/components/MomentsPanel";
import { getMomentStyle } from "@/components/MomentChip";
import { cn } from "@/lib/utils";
import { parseJsonl } from "@/lib/replay/parseJsonl";
import type { ReplayEvent, ParseError } from "@/lib/replay/parseJsonl";
import type {
  EventSourceStatus,
  MatchEventSource,
  MatchEventSourceSnapshot,
} from "@/lib/replay/eventSource";
import { createFileEventSource, createLiveEventSource } from "@/lib/replay/eventSource";
import { buildMomentEventRangeMap, detectMoments } from "@/lib/replay/detectMoments";
import type { ReplayMoment } from "@/lib/replay/detectMoments";
import { redactEvent } from "@/lib/replay/redaction";
import type { ViewerMode, RedactedEvent } from "@/lib/replay/redaction";
import { formatEvent } from "@/lib/replay/formatEvent";
import type { FormattedEvent } from "@/lib/replay/formatEvent";
import { SAMPLE_JSONL } from "@/lib/replay/fixtures/sampleNumberGuess";
import { parseCommentaryFile, getCommentaryAtIndex } from "@/lib/replay/commentary";
import type {
  CommentaryEntry,
  CommentaryWarning,
  CommentaryLoadStatus,
  CommentarySeverity,
} from "@/lib/replay/commentary";
import { isHeistScenario, useHeistScene } from "@/components/heist/useHeistScene";
import { HeistViewportDynamic } from "@/components/heist/HeistViewportDynamic";
import { BehaviorProfilePanel } from "@/components/BehaviorProfilePanel";
import { Map } from "lucide-react";

// ---------------------------------------------------------------------------
// Known event types for the type filter
// ---------------------------------------------------------------------------

const KNOWN_EVENT_TYPES = [
  "MatchStarted",
  "TurnStarted",
  "ObservationEmitted",
  "ActionSubmitted",
  "ActionAdjudicated",
  "StateUpdated",
  "AgentError",
  "MatchEnded",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TurnGroup<T extends RedactedEvent = RedactedEvent> {
  label: string;
  turn: number | null;
  events: T[];
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
interface FailureModeHitEntry {
  id: `FM-${string}`;
  count: number;
  rate?: number;
  detectorSource: "core" | `scenario:${string}`;
}

interface FailureModeProfileEntry {
  fmClassifierVersion: string;
  byAgentId: Record<string, FailureModeHitEntry[]>;
}

interface MatchSummaryEntry {
  matchId: string;
  matchKey: string;
  seed: number;
  agentIds: string[];
  scores: Record<string, number>;
  timeoutsPerAgent: Record<string, number>;
  forfeitedBy?: string;
  winner: string | null;
  turns: number;
  reason: string;
  failureModes?: FailureModeProfileEntry;
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

/** A source-agnostic handle for reading tournament files. */
type TournamentSource =
  | { kind: "dirHandle"; handle: FileSystemDirectoryHandle }
  | { kind: "fileMap"; files: Map<string, File> };

/** Loaded tournament data held in state. */
interface TournamentData {
  tournament: TournamentMeta;
  standings: StandingsEntry[];
  matchSummaries: MatchSummaryEntry[];
  source: TournamentSource;
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
      moments: ReplayMoment[] | null;
    }
  | { mode: "live"; matchId: string; snapshot: MatchEventSourceSnapshot }
  | { mode: "liveError"; message: string };

/** Event filter state. */
interface EventFilters {
  turn: number | null;
  agentId: string | null;
  type: string | null;
}

const EMPTY_FILTERS: EventFilters = { turn: null, agentId: null, type: null };

/** Autoplay speed presets — label and interval in ms. */
const AUTOPLAY_SPEEDS = [
  { label: "0.5x", ms: 2000 },
  { label: "1x", ms: 1000 },
  { label: "2x", ms: 500 },
  { label: "4x", ms: 250 },
  { label: "10x", ms: 100 },
] as const;

type AutoplaySpeedIdx = 0 | 1 | 2 | 3 | 4;

// Moment type styles are now provided by MomentChip.tsx via getMomentStyle().
// The canonical color mapping (score_swing→orange, lead_change→blue, comeback→green,
// blunder→red, clutch→gold, close_call→purple, unknown→gray) is enforced there.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByTurn<T extends RedactedEvent>(events: T[]): TurnGroup<T>[] {
  const groups: TurnGroup<T>[] = [];
  let current: TurnGroup<T> | null = null;

  for (const ev of events) {
    const turn = ev.turn ?? null;
    if (current === null || current.turn !== turn) {
      current = {
        label: turn !== null ? `Turn ${turn}` : "Pre-game",
        turn,
        events: [],
      };
      groups.push(current);
    }
    current.events.push(ev);
  }

  return groups;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Badge styles for formatted events (matches live viewer pattern from PR #112)
// ---------------------------------------------------------------------------

const badgeStyles: Record<FormattedEvent["badge"], string> = {
  action: "bg-primary/10 text-primary",
  wait: "bg-muted text-muted-foreground",
  invalid: "bg-destructive/10 text-destructive font-medium",
  system: "bg-muted text-muted-foreground italic",
  score: "bg-amber-500/10 text-amber-400",
  end: "bg-green-500/10 text-green-400 font-medium",
};

/** Extract unique agent IDs from events. */
function extractAgentIds(events: ReplayEvent[]): string[] {
  const ids = new Set<string>();
  for (const ev of events) {
    if (ev.agentId) {
      ids.add(ev.agentId);
    }
  }
  return Array.from(ids).sort();
}

/** Extract unique event types from events. */
function extractEventTypes(events: ReplayEvent[]): string[] {
  const types = new Set<string>();
  for (const ev of events) {
    types.add(ev.type);
  }
  return Array.from(types);
}

/** Check if an event type is unknown (not in the spec). */
function isUnknownType(type: string): boolean {
  return !(KNOWN_EVENT_TYPES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// File System Access API helpers
// ---------------------------------------------------------------------------

function hasDirectoryPicker(): boolean {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return false;
  }
  type WindowWithPicker = Window & {
    showDirectoryPicker?: unknown;
  };
  return typeof (window as WindowWithPicker).showDirectoryPicker === "function";
}

async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  return (
    window as unknown as Window & {
      showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker();
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

// ---------------------------------------------------------------------------
// File-map helpers (for <input webkitdirectory> fallback)
// ---------------------------------------------------------------------------

/** Build a Map of normalised relative paths to File objects from a FileList. */
function buildFileMap(fileList: FileList): Map<string, File> {
  const map = new (Map as unknown as { new (): Map<string, File> })();
  for (const file of Array.from(fileList)) {
    const rawPath = file.webkitRelativePath || file.name;
    const normalized = rawPath.replace(/\\/g, "/");
    map.set(normalized, file);
  }
  return map;
}

/**
 * Find a file in the map by its relative path segments within the tournament
 * folder.  Handles both "parentDir/path" and "path" depending on which folder
 * the user selected.
 */
function findFileInMap(fileMap: Map<string, File>, ...segments: string[]): File | undefined {
  const target = segments.join("/");
  // Direct match
  const direct = fileMap.get(target);
  if (direct) {
    return direct;
  }
  // Suffix match (user selected parent folder, so paths are prefixed)
  for (const [key, file] of fileMap) {
    if (key.endsWith("/" + target)) {
      return file;
    }
  }
  return undefined;
}

async function readTextFromFileMap(fileMap: Map<string, File>, ...path: string[]): Promise<string> {
  const file = findFileInMap(fileMap, ...path);
  if (!file) {
    throw new Error(`File not found: ${path.join("/")}`);
  }
  return file.text();
}

// ---------------------------------------------------------------------------
// Source-agnostic reading helpers
// ---------------------------------------------------------------------------

async function readTextFromSource(source: TournamentSource, ...path: string[]): Promise<string> {
  if (source.kind === "dirHandle") {
    return readTextFile(source.handle, ...path);
  }
  return readTextFromFileMap(source.files, ...path);
}

async function readJsonFromSource<T>(source: TournamentSource, ...path: string[]): Promise<T> {
  const text = await readTextFromSource(source, ...path);
  return JSON.parse(text) as T;
}

function parseMomentsJson(raw: unknown): ReplayMoment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const moments: ReplayMoment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.label !== "string" ||
      typeof record.type !== "string" ||
      typeof record.startSeq !== "number" ||
      typeof record.endSeq !== "number"
    ) {
      continue;
    }
    const signals =
      record.signals && typeof record.signals === "object" && !Array.isArray(record.signals)
        ? (record.signals as Record<string, unknown>)
        : {};
    const description = typeof record.description === "string" ? record.description : undefined;
    moments.push({
      id: record.id,
      label: record.label,
      type: record.type as ReplayMoment["type"],
      startSeq: record.startSeq,
      endSeq: record.endSeq,
      signals,
      ...(description ? { description } : {}),
    });
  }
  return moments;
}

/**
 * Validate the optional `failureModes` block from a match_summary.json.
 * Returns { status: "present", data } on success, { status: "invalid", raw }
 * on malformed input, or { status: "absent" } if the field is missing.
 */
type FmParseResult =
  | { status: "present"; data: FailureModeProfileEntry }
  | { status: "invalid"; raw: unknown }
  | { status: "absent" };

function parseFailureModes(summary: MatchSummaryEntry): FmParseResult {
  const raw = summary.failureModes;
  if (raw === undefined || raw === null) {
    return { status: "absent" };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "invalid", raw };
  }
  const block = raw as unknown as Record<string, unknown>;
  if (typeof block.fmClassifierVersion !== "string") {
    return { status: "invalid", raw };
  }
  if (!block.byAgentId || typeof block.byAgentId !== "object" || Array.isArray(block.byAgentId)) {
    return { status: "invalid", raw };
  }
  const byAgentId = block.byAgentId as Record<string, unknown>;
  const parsed: Record<string, FailureModeHitEntry[]> = {};
  for (const [agentId, entries] of Object.entries(byAgentId)) {
    if (!Array.isArray(entries)) {
      return { status: "invalid", raw };
    }
    const agentEntries: FailureModeHitEntry[] = [];
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof (entry as Record<string, unknown>).id !== "string" ||
        typeof (entry as Record<string, unknown>).count !== "number" ||
        typeof (entry as Record<string, unknown>).detectorSource !== "string"
      ) {
        continue; // skip malformed entries tolerantly
      }
      const e = entry as Record<string, unknown>;
      agentEntries.push({
        id: e.id as FailureModeHitEntry["id"],
        count: e.count as number,
        detectorSource: e.detectorSource as FailureModeHitEntry["detectorSource"],
        ...(typeof e.rate === "number" ? { rate: e.rate } : {}),
      });
    }
    parsed[agentId] = agentEntries;
  }
  return {
    status: "present",
    data: {
      fmClassifierVersion: block.fmClassifierVersion as string,
      byAgentId: parsed,
    },
  };
}

/** Load all tournament data from any supported source. */
async function loadTournamentFromSource(source: TournamentSource): Promise<TournamentData> {
  const tournament = await readJsonFromSource<TournamentMeta>(source, "tournament.json");
  const standings = await readJsonFromSource<StandingsEntry[]>(source, "standings.json");

  const matchSummaries: MatchSummaryEntry[] = [];
  for (const spec of tournament.matches) {
    try {
      const summary = await readJsonFromSource<MatchSummaryEntry>(
        source,
        "matches",
        spec.matchKey,
        "match_summary.json",
      );
      matchSummaries.push(summary);
    } catch {
      // Skip matches without a summary file
    }
  }

  return { tournament, standings, matchSummaries, source };
}

/** Load a single match's JSONL from the tournament source. */
async function loadMatchFromSource(
  source: TournamentSource,
  matchKey: string,
): Promise<{ events: ReplayEvent[]; errors: ParseError[]; moments: ReplayMoment[] | null }> {
  const text = await readTextFromSource(source, "matches", matchKey, "match.jsonl");
  const parsed = parseJsonl(text);
  let moments: ReplayMoment[] | null = null;

  try {
    const momentsRaw = await readJsonFromSource<unknown>(
      source,
      "matches",
      matchKey,
      "moments.json",
    );
    moments = parseMomentsJson(momentsRaw);
  } catch {
    moments = null;
  }

  return { ...parsed, moments };
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
  const dirInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);

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

  const handleLoadSampleFile = useCallback(async () => {
    setSampleLoading(true);
    try {
      const res = await fetch("/replays/number-guess-demo.jsonl");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      onLoad(text, "number-guess-demo.jsonl");
    } catch {
      // Fall back to the embedded sample
      handleSample();
    } finally {
      setSampleLoading(false);
    }
  }, [onLoad, handleSample]);

  const handleTournamentFolder = useCallback(async () => {
    setTournamentError(null);
    setTournamentLoading(true);
    try {
      const dirHandle = await pickDirectory();
      const source: TournamentSource = { kind: "dirHandle", handle: dirHandle };
      const data = await loadTournamentFromSource(source);
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

  const handleDirectoryUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        return;
      }
      setTournamentError(null);
      setTournamentLoading(true);
      try {
        const fileMap = buildFileMap(files);
        const source: TournamentSource = { kind: "fileMap", files: fileMap };
        const data = await loadTournamentFromSource(source);
        onTournamentLoad(data);
      } catch (err) {
        if (err instanceof Error) {
          setTournamentError(err.message);
        } else {
          setTournamentError("Failed to load tournament folder");
        }
      } finally {
        setTournamentLoading(false);
        // Reset input so the same folder can be re-selected
        e.target.value = "";
      }
    },
    [onTournamentLoad],
  );

  // IMPORTANT: don't feature-detect during render.

  // This component is pre-rendered on the server, so `hasDirectoryPicker()` would

  // return false on the server and true on the client, causing a hydration mismatch.

  const [directoryPickerAvailable, setDirectoryPickerAvailable] = useState(false);

  useEffect(() => {
    setDirectoryPickerAvailable(hasDirectoryPicker());
  }, []);
  // Set non-standard webkitdirectory / directory attributes imperatively
  // to avoid TypeScript errors with unknown JSX props.
  useEffect(() => {
    const el = dirInputRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-bold">Replay Viewer</h1>
        <p className="text-sm text-muted-foreground">
          Watch a match and explore the timeline
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
            <p className="mb-1 text-sm font-medium">Drop a replay file here</p>
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

          <Button
            variant="secondary"
            className="w-full"
            onClick={handleLoadSampleFile}
            disabled={sampleLoading}
          >
            {sampleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Load sample replay (Number Guess)
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Hidden directory input for the fallback upload path */}
          <input
            ref={dirInputRef}
            type="file"
            multiple
            onChange={handleDirectoryUpload}
            className="hidden"
          />

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
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => dirInputRef.current?.click()}
              disabled={tournamentLoading}
            >
              {tournamentLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              Load tournament folder
            </Button>
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

  const scores: Record<string, number> | null =
    spoilers && matchEnded ? (matchEnded.raw.scores as Record<string, number>) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Scoreboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {agentIds.map((id) => (
            <AgentCard
              key={id}
              name={id}
              score={scores ? (scores[id] ?? null) : null}
              variant="expanded"
            />
          ))}
        </div>
        {!spoilers && matchEnded && (
          <p className="mt-2 text-xs text-muted-foreground italic">
            Enable spoilers to reveal scores
          </p>
        )}
        {spoilers && matchEnded && typeof matchEnded.raw.reason === "string" && (
          <p className="mt-2 text-xs text-muted-foreground">Reason: {matchEnded.raw.reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Event card with redaction-aware rendering
// ---------------------------------------------------------------------------

function EventCard({
  event,
  isSelected,
  onClick,
  scenarioName,
}: {
  event: RedactedEvent;
  isSelected: boolean;
  onClick: () => void;
  scenarioName: string;
}) {
  const unknown = isUnknownType(event.type);
  const formatted = formatEvent(event.displayRaw, scenarioName);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border px-3 py-2 text-xs transition-colors",
        isSelected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
        unknown && "border-dashed",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted-foreground">{event.seq}</span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase",
            unknown ? "bg-orange-500/10 text-orange-400 italic" : badgeStyles[formatted.badge],
          )}
        >
          {unknown ? `${event.type} (unknown)` : formatted.badge}
        </span>
        {event.agentId && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {event.agentId}
          </Badge>
        )}
        {event.isRedacted && <ShieldAlert className="h-3 w-3 text-muted-foreground" />}
      </div>
      <p className="mt-0.5 text-muted-foreground truncate">{formatted.primaryText}</p>
      {formatted.details && (
        <p className="mt-0.5 text-[10px] text-muted-foreground/70 truncate">{formatted.details}</p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Event detail with redaction and raw JSON toggle
// ---------------------------------------------------------------------------

function EventDetail({
  event,
  viewerMode,
  scenarioName,
}: {
  event: RedactedEvent | null;
  viewerMode: ViewerMode;
  scenarioName: string;
}) {
  const [showRaw, setShowRaw] = useState(false);

  if (!event) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an event from the timeline
      </div>
    );
  }

  const displayData = showRaw && event.fullRaw ? event.fullRaw : event.displayRaw;
  const unknown = isUnknownType(event.type);
  const formatted = formatEvent(event.displayRaw, scenarioName);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={unknown ? "warning" : "info"}>{event.type}</Badge>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] uppercase",
            badgeStyles[formatted.badge],
          )}
        >
          {formatted.badge}
        </span>
        <span className="font-mono text-xs text-muted-foreground">seq {event.seq}</span>
        {event.agentId && <Badge variant="outline">{event.agentId}</Badge>}
        {event.turn !== undefined && (
          <span className="text-xs text-muted-foreground">turn {event.turn}</span>
        )}
        {event.isRedacted && (
          <Badge variant="secondary" className="text-[10px]">
            <ShieldAlert className="mr-1 h-3 w-3" />
            redacted
          </Badge>
        )}
        {unknown && (
          <Badge variant="warning" className="text-[10px]">
            unknown type — raw fallback
          </Badge>
        )}
      </div>

      <p className="text-sm">{formatted.primaryText}</p>
      {formatted.details && <p className="text-xs text-muted-foreground">{formatted.details}</p>}

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {showRaw && event.fullRaw ? "Raw JSON (unrestricted)" : "JSON"}
        </span>
        {event.fullRaw && (
          <button
            onClick={() => setShowRaw((s) => !s)}
            className="text-xs text-primary hover:underline"
          >
            {showRaw ? "Show redacted" : "Show full raw"}
          </button>
        )}
        {viewerMode !== "director" && event.isRedacted && !event.fullRaw && (
          <span className="text-xs text-muted-foreground italic">
            Enable spoilers to see full data
          </span>
        )}
      </div>

      <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed max-h-96">
        {prettyJson(displayData)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event filter bar
// ---------------------------------------------------------------------------

function ReplayFilterBar({
  events,
  filters,
  onFiltersChange,
}: {
  events: ReplayEvent[];
  filters: EventFilters;
  onFiltersChange: (f: EventFilters) => void;
}) {
  const agentIds = useMemo(() => extractAgentIds(events), [events]);
  const eventTypes = useMemo(() => extractEventTypes(events), [events]);
  const turnNumbers = useMemo(() => {
    const turns = new Set<number>();
    for (const ev of events) {
      if (ev.turn !== undefined) {
        turns.add(ev.turn);
      }
    }
    return Array.from(turns).sort((a, b) => a - b);
  }, [events]);

  const hasFilters = filters.turn !== null || filters.agentId !== null || filters.type !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Filter className="h-3 w-3 text-muted-foreground" />

      <select
        value={filters.turn ?? ""}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            turn: e.target.value === "" ? null : Number(e.target.value),
          })
        }
        className="h-7 rounded-md border border-border bg-card px-2 text-xs"
      >
        <option value="">All turns</option>
        {turnNumbers.map((t) => (
          <option key={t} value={t}>
            Turn {t}
          </option>
        ))}
      </select>

      <select
        value={filters.agentId ?? ""}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            agentId: e.target.value === "" ? null : e.target.value,
          })
        }
        className="h-7 rounded-md border border-border bg-card px-2 text-xs"
      >
        <option value="">All agents</option>
        {agentIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      <select
        value={filters.type ?? ""}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            type: e.target.value === "" ? null : e.target.value,
          })
        }
        className="h-7 rounded-md border border-border bg-card px-2 text-xs"
      >
        <option value="">All types</option>
        {eventTypes.map((t) => (
          <option key={t} value={t}>
            {t}
            {isUnknownType(t) ? " (unknown)" : ""}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={() => onFiltersChange(EMPTY_FILTERS)}
          className="text-xs text-primary hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deterministic ordering tooltip
// ---------------------------------------------------------------------------

function OrderingTooltip() {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        className="text-muted-foreground hover:text-foreground"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((s) => !s)}
        aria-label="Ordering explanation"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card p-3 text-xs shadow-lg">
          <p className="font-medium mb-1">Deterministic ordering</p>
          <p className="text-muted-foreground">
            Events are sorted by <code className="rounded bg-muted px-1">seq</code> (ascending),
            with ties broken by original event order. This guarantees identical
            display order across reloads and machines.
          </p>
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Viewer mode selector
// ---------------------------------------------------------------------------

function ViewerModeSelector({
  mode,
  onChange,
  disabled,
}: {
  mode: ViewerMode;
  onChange: (m: ViewerMode) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={mode}
      onChange={(e) => onChange(e.target.value as ViewerMode)}
      disabled={disabled}
      className="h-8 rounded-md border border-border bg-card px-2 text-xs"
    >
      <option value="spectator">Spectator</option>
      <option value="postMatch">Post-match</option>
      <option value="director">Director</option>
    </select>
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
  onSelectMatch: (matchKey: string) => Promise<void>;
  onClose: () => void;
}) {
  const [spoilers, setSpoilers] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState<string | null>(null);

  const { tournament, standings, matchSummaries } = data;

  const summaryByKey = useMemo(() => {
    const map = new (Map as unknown as { new (): Map<string, MatchSummaryEntry> })();
    for (const s of matchSummaries) {
      map.set(s.matchKey, s);
    }
    return map;
  }, [matchSummaries]);

  const handleWatch = useCallback(
    async (matchKey: string) => {
      setLoadingMatch(matchKey);
      try {
        await onSelectMatch(matchKey);
      } finally {
        // Always clear loading state so the user can retry if load fails.
        setLoadingMatch(null);
      }
    },
    [onSelectMatch],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Tournament: {tournament.scenarioName}</p>
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
                        <span
                          className={row.scoreDiff > 0 ? "text-green-400" : "text-muted-foreground"}
                        >
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
                  {spoilers && <th className="pb-2 pr-4 font-medium">Scores</th>}
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
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{spec.matchKey}</td>
                      <td className="py-2 pr-4">{spec.agentIds.join(" vs ")}</td>
                      <td className="py-2 pr-4">{spec.scenarioName}</td>
                      <td className="py-2 pr-4 text-right">{turns}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={reason === "completed" ? "success" : "secondary"}>
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
                            : "\u2014"}
                        </td>
                      )}

                      <td className="py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => void handleWatch(spec.matchKey)}
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
// Commentary severity styling
// ---------------------------------------------------------------------------

const severityStyles: Record<CommentarySeverity, string> = {
  hype: "border-amber-500/40 bg-amber-500/5",
  analysis: "border-blue-400/40 bg-blue-400/5",
  ref: "border-purple-400/40 bg-purple-400/5",
  info: "border-border bg-muted/20",
};

const severityBadgeVariant: Record<
  CommentarySeverity,
  "warning" | "info" | "secondary" | "default"
> = {
  hype: "warning",
  analysis: "info",
  ref: "secondary",
  info: "default",
};

// ---------------------------------------------------------------------------
// Commentary entry card
// ---------------------------------------------------------------------------

function CommentaryCard({ entry }: { entry: CommentaryEntry }) {
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs", severityStyles[entry.severity])}>
      <div className="flex items-center gap-1.5 mb-1">
        <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
        {entry.speaker && (
          <span className="font-medium text-muted-foreground">{entry.speaker}</span>
        )}
        <Badge variant={severityBadgeVariant[entry.severity]} className="text-[9px] px-1 py-0">
          {entry.severity}
        </Badge>
        <span className="text-[9px] text-muted-foreground/60 ml-auto">SHOW</span>
      </div>
      <p className="text-foreground/90 leading-relaxed">{entry.text}</p>
      {entry.tags.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {entry.tags.map((tag) => (
            <span key={tag} className="rounded bg-muted px-1 py-0 text-[9px] text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commentary panel
// ---------------------------------------------------------------------------

function CommentaryPanel({
  entries,
  loadStatus,
  warnings,
  onLoadFile,
  onClear,
}: {
  entries: CommentaryEntry[];
  loadStatus: CommentaryLoadStatus;
  warnings: CommentaryWarning[];
  onLoadFile: (file: File) => void;
  onClear: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Commentary
        </h2>
        <span className="text-[9px] text-muted-foreground/60 italic">show layer</span>
      </div>

      {loadStatus === "none" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">No commentary loaded.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onLoadFile(f);
              }
              e.target.value = "";
            }}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <MessageSquare className="h-3 w-3" />
            Load commentary.json
          </Button>
        </div>
      )}

      {loadStatus === "error" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <p>Failed to parse commentary file.</p>
          </div>
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={onClear}>
            Dismiss
          </Button>
        </div>
      )}

      {loadStatus === "loaded" && (
        <>
          {warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
              <p className="text-amber-400">
                {warnings.length} commentary {warnings.length === 1 ? "entry was" : "entries were"}{" "}
                ignored.
              </p>
            </div>
          )}

          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No commentary for this moment.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <CommentaryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onClear}>
            <X className="h-3 w-3" />
            Remove commentary
          </Button>
        </>
      )}
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
  momentsOverride,
  liveStatus,
  lockSensitiveControls = false,
  matchSummary,
}: {
  events: ReplayEvent[];
  errors: ParseError[];
  filename: string;
  onClose: () => void;
  onBack?: () => void;
  momentsOverride?: ReplayMoment[] | null;
  liveStatus?: EventSourceStatus;
  lockSensitiveControls?: boolean;
  matchSummary?: MatchSummaryEntry | null;
}) {
  const [spoilers, setSpoilers] = useState(false);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("spectator");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);

  // Heist map view state
  const [showMapView, setShowMapView] = useState(false);
  const isHeist = useMemo(() => isHeistScenario(events), [events]);

  // Autoplay state
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState<AutoplaySpeedIdx>(1); // default 1x

  const moments = useMemo(
    () => momentsOverride ?? detectMoments(events),
    [events, momentsOverride],
  );
  const momentRanges = useMemo(() => buildMomentEventRangeMap(moments, events), [moments, events]);

  // Commentary state
  const [commentaryEntries, setCommentaryEntries] = useState<CommentaryEntry[]>([]);
  const [commentaryLoadStatus, setCommentaryLoadStatus] = useState<CommentaryLoadStatus>("none");
  const [commentaryWarnings, setCommentaryWarnings] = useState<CommentaryWarning[]>([]);

  const loadCommentaryFromFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== "string") {
          setCommentaryLoadStatus("error");
          return;
        }
        const result = parseCommentaryFile(text, moments, events.length, momentRanges);
        if (result.entries.length === 0 && result.warnings.length > 0) {
          setCommentaryLoadStatus("error");
          setCommentaryWarnings(result.warnings);
          return;
        }
        setCommentaryEntries(result.entries);
        setCommentaryWarnings(result.warnings);
        setCommentaryLoadStatus("loaded");
      };
      reader.onerror = () => {
        setCommentaryLoadStatus("error");
      };
      reader.readAsText(file);
    },
    [moments, events.length, momentRanges],
  );

  const clearCommentary = useCallback(() => {
    setCommentaryEntries([]);
    setCommentaryWarnings([]);
    setCommentaryLoadStatus("none");
  }, []);

  // Compute redacted events based on current mode/spoiler settings
  const redactedEvents = useMemo(
    () => events.map((ev) => redactEvent(ev, { mode: viewerMode, revealSpoilers: spoilers })),
    [events, viewerMode, spoilers],
  );

  // Apply filters
  const indexedRedacted = useMemo(
    () => redactedEvents.map((ev, originalIdx) => ({ ...ev, originalIdx })),
    [redactedEvents],
  );

  const filteredRedacted = useMemo(() => {
    return indexedRedacted.filter((ev) => {
      if (filters.turn !== null && ev.turn !== filters.turn) {
        return false;
      }
      if (filters.agentId !== null && ev.agentId !== filters.agentId) {
        return false;
      }
      if (filters.type !== null && ev.type !== filters.type) {
        return false;
      }
      return true;
    });
  }, [indexedRedacted, filters]);

  const groups = useMemo(() => groupByTurn(filteredRedacted), [filteredRedacted]);
  const selectedEvent = filteredRedacted[selectedIdx] ?? null;

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
      const idx = filteredRedacted.findIndex((e) => e.turn === turn);
      if (idx >= 0) {
        setSelectedIdx(idx);
      }
    },
    [filteredRedacted],
  );

  // Clamp selectedIdx when filters change
  useEffect(() => {
    if (selectedIdx >= filteredRedacted.length) {
      setSelectedIdx(Math.max(0, filteredRedacted.length - 1));
    }
  }, [filteredRedacted.length, selectedIdx]);

  const prevEvent = () => setSelectedIdx((i) => Math.max(0, i - 1));
  const nextEvent = () => setSelectedIdx((i) => Math.min(filteredRedacted.length - 1, i + 1));
  const firstEvent = () => setSelectedIdx(0);
  const lastEvent = () => setSelectedIdx(filteredRedacted.length - 1);
  const activeMoment = useMemo(() => {
    const activeIdx = selectedEvent?.originalIdx;
    if (activeIdx === undefined) {
      return null;
    }
    return (
      moments.find((moment) => {
        const range = momentRanges.get(moment.id);
        if (!range) {
          return false;
        }
        return activeIdx >= range.startEventIdx && activeIdx <= range.endEventIdx;
      }) ?? null
    );
  }, [moments, momentRanges, selectedEvent?.originalIdx]);

  const jumpToMoment = useCallback(
    (moment: ReplayMoment) => {
      const range = momentRanges.get(moment.id);
      if (!range) {
        return;
      }
      const idx = filteredRedacted.findIndex(
        (ev) => ev.originalIdx >= range.startEventIdx && ev.originalIdx <= range.endEventIdx,
      );
      if (idx >= 0) {
        setSelectedIdx(idx);
      }
    },
    [filteredRedacted, momentRanges],
  );

  // Autoplay effect: advance playhead at the configured speed
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const interval = setInterval(() => {
      setSelectedIdx((prev) => {
        if (prev >= filteredRedacted.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, AUTOPLAY_SPEEDS[speedIdx].ms);
    return () => clearInterval(interval);
  }, [isPlaying, speedIdx, filteredRedacted.length]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          setIsPlaying((p) => !p);
          break;
        case "ArrowLeft":
          e.preventDefault();
          setIsPlaying(false);
          setSelectedIdx((i) => Math.max(0, i - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setIsPlaying(false);
          setSelectedIdx((i) => Math.min(filteredRedacted.length - 1, i + 1));
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredRedacted.length]);

  const togglePlay = useCallback(() => {
    if (selectedIdx >= filteredRedacted.length - 1) {
      // Reset to beginning if at end
      setSelectedIdx(0);
    }
    setIsPlaying((p) => !p);
  }, [selectedIdx, filteredRedacted.length]);

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((prev) => ((prev + 1) % AUTOPLAY_SPEEDS.length) as AutoplaySpeedIdx);
  }, []);

  // Derive if spoilers is effectively active (director mode forces it)
  const effectiveSpoilers = spoilers || viewerMode === "director";

  // Scenario/stakes header data — derived from MatchStarted event
  const scenarioInfo = useMemo(() => {
    const matchStarted = events.find((e) => e.type === "MatchStarted");
    if (!matchStarted) {
      return { scenarioName: null, maxTurns: null };
    }
    const scenarioName =
      typeof matchStarted.raw.scenarioName === "string" ? matchStarted.raw.scenarioName : null;
    const maxTurns =
      typeof matchStarted.raw.maxTurns === "number" ? matchStarted.raw.maxTurns : null;
    return { scenarioName, maxTurns };
  }, [events]);

  // FM telemetry parse result (tolerant)
  const fmResult = useMemo(
    () => (matchSummary ? parseFailureModes(matchSummary) : ({ status: "absent" } as const)),
    [matchSummary],
  );

  // Compute heist scene state at the current cursor for the map view.
  // Uses the *original* event index (not filtered) to reduce the full stream.
  const heistCursorIndex = selectedEvent?.originalIdx ?? selectedIdx;
  const heistScene = useHeistScene(isHeist && showMapView ? events : [], heistCursorIndex);

  useEffect(() => {
    if (lockSensitiveControls) {
      setViewerMode("spectator");
      setSpoilers(false);
    }
  }, [lockSensitiveControls]);

  // Commentary entries visible at the current playhead position
  const activeCommentary = useMemo(() => {
    if (commentaryLoadStatus !== "loaded" || commentaryEntries.length === 0) {
      return [];
    }
    const playheadIdx = selectedEvent?.originalIdx ?? 0;
    return getCommentaryAtIndex(
      commentaryEntries,
      playheadIdx,
      moments,
      momentRanges,
      playheadIdx,
      effectiveSpoilers,
    );
  }, [
    commentaryEntries,
    commentaryLoadStatus,
    selectedEvent?.originalIdx,
    moments,
    momentRanges,
    effectiveSpoilers,
  ]);

  return (
    <div className="flex h-[calc(100vh-theme(spacing.14)-theme(spacing.12))] flex-col gap-3">
      {/* Top bar */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3 flex-wrap">
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
            {filteredRedacted.length !== events.length && (
              <span> ({filteredRedacted.length} shown)</span>
            )}
            {errors.length > 0 && (
              <span className="text-amber-400"> · {errors.length} parse errors</span>
            )}
          </p>
        </div>
        {liveStatus && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase tracking-wider",
              liveStatus === "loading" && "border-blue-500/40 text-blue-400",
              liveStatus === "complete" && "border-emerald-500/40 text-emerald-400",
              liveStatus === "error" && "border-destructive/50 text-destructive",
            )}
          >
            {liveStatus === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
            {liveStatus === "loading" ? "Live" : liveStatus}
          </Badge>
        )}

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={firstEvent} disabled={selectedIdx === 0}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={prevEvent} disabled={selectedIdx === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[4rem] text-center text-xs font-mono text-muted-foreground">
            {filteredRedacted.length > 0 ? selectedIdx + 1 : 0} / {filteredRedacted.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={nextEvent}
            disabled={selectedIdx === filteredRedacted.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={lastEvent}
            disabled={selectedIdx === filteredRedacted.length - 1}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>

          {/* Autoplay controls */}
          <Button
            variant={isPlaying ? "default" : "outline"}
            size="icon"
            onClick={togglePlay}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleSpeed}
            title="Cycle playback speed"
            className="min-w-[3.5rem] font-mono text-xs"
          >
            <Gauge className="h-3 w-3" />
            {AUTOPLAY_SPEEDS[speedIdx].label}
          </Button>
        </div>

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
              <option value="">&mdash;</option>
              {turnNumbers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        <ViewerModeSelector
          mode={viewerMode}
          onChange={setViewerMode}
          disabled={lockSensitiveControls}
        />

        <Button
          variant={effectiveSpoilers ? "destructive" : "outline"}
          size="sm"
          onClick={() => setSpoilers((s) => !s)}
          disabled={viewerMode === "director" || lockSensitiveControls}
        >
          {effectiveSpoilers ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Spoilers {effectiveSpoilers ? "ON" : "OFF"}
        </Button>

        {isHeist && (
          <Button
            variant={showMapView ? "default" : "outline"}
            size="sm"
            onClick={() => setShowMapView((v) => !v)}
          >
            <Map className="h-3 w-3" />
            {showMapView ? "Timeline View" : "Map View"}
          </Button>
        )}

        {!onBack && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Spoiler warning banner */}
      {effectiveSpoilers && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
          <Eye className="h-3 w-3 shrink-0" />
          <span>
            Spoiler mode is active — scores, observations, and match details are visible.
            {viewerMode === "director" && " Director mode always reveals all data."}
          </span>
        </div>
      )}

      {/* Parse errors */}
      {errors.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium text-amber-400">Parse warnings ({errors.length})</p>
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

      {/* Scenario/Stakes header */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
        <span className="font-medium">{scenarioInfo.scenarioName ?? "Unknown Scenario"}</span>
        <span className="text-muted-foreground">{"\u00B7"}</span>
        <span className="text-muted-foreground font-mono text-xs">
          Turn {currentTurn ?? "\u2014"} / {scenarioInfo.maxTurns ?? "\u2014"}
        </span>
        {activeMoment && (
          <>
            <span className="text-muted-foreground">{"\u00B7"}</span>
            <span
              className={cn(
                "inline-block rounded px-1.5 py-0 text-[10px] font-medium border",
                getMomentStyle(activeMoment.type).badge,
              )}
            >
              {activeMoment.type.replace(/_/g, " ")}
            </span>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <ReplayFilterBar events={events} filters={filters} onFiltersChange={setFilters} />
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Ordered by seq</span>
          <OrderingTooltip />
        </div>
      </div>

      {/* Heist spatial viewport */}
      {showMapView && heistScene && (
        <div className="h-80 shrink-0 overflow-hidden rounded-md border border-border">
          <HeistViewportDynamic scene={heistScene} />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Moments + Commentary sidebar */}
        <div className="w-60 shrink-0 overflow-y-auto rounded-md border border-border bg-card p-3 space-y-4">
          <div>
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Moments
            </h2>
            <MomentsPanel
              moments={moments}
              momentRanges={momentRanges}
              onSelectMoment={jumpToMoment}
              activeMomentId={activeMoment?.id}
              spoilers={effectiveSpoilers}
            />
          </div>

          <div className="border-t border-border pt-3">
            <CommentaryPanel
              entries={activeCommentary}
              loadStatus={commentaryLoadStatus}
              warnings={commentaryWarnings}
              onLoadFile={loadCommentaryFromFile}
              onClear={clearCommentary}
            />
          </div>
        </div>

        {/* Timeline sidebar */}
        <div className="w-72 shrink-0 overflow-y-auto rounded-md border border-border bg-card p-3">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Timeline
          </h2>
          {filteredRedacted.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events match filters.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group, gi) => (
                <div key={gi}>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
                  <div className="space-y-1">
                    {group.events.map((ev) => {
                      const flatIdx = filteredRedacted.indexOf(ev);
                      return (
                        <EventCard
                          key={`${ev.seq}-${ev.type}`}
                          event={ev}
                          isSelected={flatIdx === selectedIdx}
                          onClick={() => setSelectedIdx(flatIdx)}
                          scenarioName={scenarioInfo.scenarioName ?? ""}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail + commentary inline + scoreboard */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex-1 overflow-y-auto rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Event Detail
            </h2>
            <EventDetail
              event={selectedEvent}
              viewerMode={viewerMode}
              scenarioName={scenarioInfo.scenarioName ?? ""}
            />

            {/* Inline commentary for the current event */}
            {activeCommentary.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Commentary
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 italic">show layer</span>
                </div>
                <div className="space-y-2">
                  {activeCommentary.map((entry) => (
                    <CommentaryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0">
            <Scoreboard events={events} spoilers={effectiveSpoilers} />
          </div>

          {fmResult.status !== "absent" && (
            <div className="shrink-0">
              <BehaviorProfilePanel fmResult={fmResult} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReplayPageClient() {
  const [state, setState] = useState<PageState>({ mode: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const liveParam = searchParams.get("live");
  const matchIdParam = searchParams.get("matchId")?.trim() ?? "";
  const liveSourceRef = useRef<MatchEventSource | null>(null);

  useEffect(() => {
    if (liveParam !== "1") {
      if (liveSourceRef.current) {
        liveSourceRef.current.close();
        liveSourceRef.current = null;
      }
      return;
    }

    if (!matchIdParam) {
      setState({ mode: "liveError", message: "Missing matchId for live replay." });
      return;
    }

    if (liveSourceRef.current) {
      liveSourceRef.current.close();
    }

    const source = createLiveEventSource(matchIdParam);
    liveSourceRef.current = source;
    setLoadError(null);
    setState({ mode: "live", matchId: matchIdParam, snapshot: source.getSnapshot() });

    const unsubscribe = source.subscribe(() => {
      setState((prev) => {
        if (prev.mode !== "live" || prev.matchId !== matchIdParam) {
          return prev;
        }
        return { ...prev, snapshot: source.getSnapshot() };
      });
    });

    return () => {
      unsubscribe();
      source.close();
      if (liveSourceRef.current === source) {
        liveSourceRef.current = null;
      }
    };
  }, [liveParam, matchIdParam]);

  const handleSingleLoad = useCallback((text: string, filename: string) => {
    const source = createFileEventSource(text);
    const { events, errors, status } = source.getSnapshot();

    if (status === "error") {
      setState({ mode: "idle" });
      setLoadError(
        errors
          .slice(0, 10)
          .map((e) => `Line ${e.line}: ${e.message}`)
          .join("\n"),
      );
    } else {
      setLoadError(null);
      setState({ mode: "single", events, errors, filename });
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
        const { events, errors, moments } = await loadMatchFromSource(state.data.source, matchKey);
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
          moments,
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

  if (state.mode === "liveError") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Unable to start live replay</p>
            <p className="mt-1 text-xs">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.mode === "live") {
    const { events, errors, status } = state.snapshot;
    const lockSensitiveControls = status === "loading";
    return (
      <div className="space-y-3">
        {status === "error" && (
          <div className="mx-auto max-w-2xl">
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Live stream error</p>
                <p className="text-xs">
                  The live replay stream ended unexpectedly. Try refreshing the page.
                </p>
              </div>
            </div>
          </div>
        )}
        <ReplayViewer
          events={events}
          errors={errors}
          filename={`Live replay — ${state.matchId}`}
          onClose={() => {
            setLoadError(null);
            setState({ mode: "idle" });
          }}
          liveStatus={status}
          lockSensitiveControls={lockSensitiveControls}
        />
      </div>
    );
  }

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

  if (state.mode === "tournamentMatch") {
    const currentMatchSummary =
      state.data.matchSummaries.find((s) => s.matchKey === state.matchKey) ?? null;
    return (
      <ReplayViewer
        events={state.events}
        errors={state.errors}
        filename={`${state.matchKey} \u2014 match.jsonl`}
        onClose={() => {
          setLoadError(null);
          setState({ mode: "idle" });
        }}
        onBack={() => {
          setLoadError(null);
          setState({ mode: "tournament", data: state.data });
        }}
        momentsOverride={state.moments}
        matchSummary={currentMatchSummary}
      />
    );
  }

  return null;
}
