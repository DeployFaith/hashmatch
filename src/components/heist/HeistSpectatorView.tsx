"use client";

import { useState, useCallback, useRef } from "react";
import type { MatchEvent } from "@/contract/types";
import { parseJsonl } from "@/lib/replay/parseJsonl";
import { useHeistPlayback } from "./useHeistPlayback";
import { HeistMap } from "./HeistMap";
import { HeistHUD } from "./HeistHUD";
import { ScorePanel } from "./ScorePanel";
import { StatusPanel } from "./StatusPanel";
import { EventToast } from "./EventToast";
import { ActionFeed } from "./ActionFeed";
import { PlaybackControls } from "./PlaybackControls";
import { MatchEndOverlay } from "./MatchEndOverlay";
import { HeistHUDOverlay } from "./hud/HeistHUDOverlay";
import { HeistMomentsPanel } from "./moments/HeistMomentsPanel";

type LoadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; events: MatchEvent[] };

function LoadingScreen() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-cyan/30 border-t-cyan" />
      <span
        className="text-sm text-muted-foreground"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        Loading match...
      </span>
    </div>
  );
}

function ErrorScreen({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
      <div
        className="text-sm text-destructive"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        {message}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="cursor-pointer rounded border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground transition-colors hover:bg-white/10"
        >
          Try another file
        </button>
        <a
          href="/replay"
          className="rounded border border-cyan/30 bg-cyan/10 px-4 py-2 text-sm text-cyan no-underline transition-colors hover:bg-cyan/20"
        >
          Open Replay Viewer
        </a>
      </div>
    </div>
  );
}

function FilePickerScreen({ onLoad }: { onLoad: (text: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onLoad(reader.result);
        }
      };
      reader.readAsText(file);
    },
    [onLoad],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const loadSample = useCallback(async () => {
    try {
      const res = await fetch("/samples/heist-sample.match.jsonl");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      onLoad(text);
    } catch {
      // Sample not available; user must pick a file
    }
  }, [onLoad]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-8 bg-background">
      <div className="flex flex-col items-center gap-2">
        <span className="text-2xl text-cyan">&#x27D0;</span>
        <h1
          className="text-xl font-bold text-foreground"
          style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
        >
          Heist Spectator
        </h1>
        <p className="text-sm text-muted-foreground">Watch a Heist match unfold in real time</p>
      </div>

      <div
        className="flex w-full max-w-md cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed p-10 transition-colors"
        style={{
          borderColor: dragging ? "rgba(0,229,255,0.5)" : "rgba(255,255,255,0.08)",
          background: dragging ? "rgba(0,229,255,0.05)" : "transparent",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="text-3xl text-muted-foreground">&#x1F4C2;</span>
        <span className="text-sm text-muted-foreground">
          Drop a Heist replay file here, or click to browse
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jsonl"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      <button
        onClick={loadSample}
        className="cursor-pointer rounded border border-cyan/30 bg-cyan/10 px-5 py-2 text-sm text-cyan transition-colors hover:bg-cyan/20"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        Load Sample Match
      </button>
    </div>
  );
}

function SpectatorPlayback({ events }: { events: MatchEvent[] }) {
  const playback = useHeistPlayback(events);

  const handlePlayPause = useCallback(() => {
    if (playback.playing) {
      playback.pause();
    } else {
      playback.play();
    }
  }, [playback]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <style>
        {`
          @keyframes toastIn {
            from { opacity: 0; transform: translateX(-50%) translateY(8px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes alertPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>

      {/* Top HUD */}
      <HeistHUD state={playback.state} turn={playback.turn} maxTurns={playback.maxTurns} />

      {/* Main viewport */}
      <div className="relative flex flex-1 items-center justify-center">
        {/* Score overlay */}
        <ScorePanel scores={playback.scores} agentIds={Object.keys(playback.state.agents)} />

        {/* Status overlay */}
        <StatusPanel state={playback.state} />

        {/* SVG Map */}
        <HeistMap state={playback.state} />

        {/* HUD overlays — inventory, objectives, alert, terminals, doors */}
        <HeistHUDOverlay state={playback.state} scores={playback.scores} />

        {/* Moments panel */}
        <HeistMomentsPanel
          events={playback.events}
          currentSeq={playback.state.lastEventSeq ?? 0}
          onSeekToSeq={playback.seek}
        />

        {/* Event toast */}
        <EventToast state={playback.state} cursor={playback.cursor} />

        {/* Action feed */}
        <ActionFeed state={playback.state} turn={playback.turn} />

        {/* Match end overlay */}
        <MatchEndOverlay
          state={playback.state}
          scores={playback.scores}
          onRestart={playback.restart}
        />
      </div>

      {/* Bottom controls */}
      <PlaybackControls
        playing={playback.playing}
        speed={playback.speed}
        isFinished={playback.isFinished}
        onPlayPause={handlePlayPause}
        onSetSpeed={playback.setSpeed}
        onRestart={playback.restart}
      />
    </div>
  );
}

function isHeistMatch(events: MatchEvent[]): boolean {
  const start = events.find((e) => e.type === "MatchStarted");
  if (!start) {
    return false;
  }
  if (start.type === "MatchStarted") {
    const name = start.scenarioName?.toLowerCase() ?? "";
    return name.includes("heist");
  }
  return false;
}

export function HeistSpectatorView() {
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  const handleLoad = useCallback((text: string) => {
    setLoadState({ phase: "loading" });
    try {
      const result = parseJsonl(text);
      if (result.events.length === 0) {
        setLoadState({ phase: "error", message: "No valid events found in file." });
        return;
      }
      // Cast ReplayEvent.raw to MatchEvent since reducer handles it defensively
      const matchEvents = result.events.map((e) => e.raw as unknown as MatchEvent);

      if (!isHeistMatch(matchEvents)) {
        setLoadState({
          phase: "error",
          message:
            "This viewer is optimized for Heist matches. The loaded file uses a different scenario.",
        });
        return;
      }

      setLoadState({ phase: "ready", events: matchEvents });
    } catch {
      setLoadState({ phase: "error", message: "Failed to parse match file." });
    }
  }, []);

  const handleReset = useCallback(() => {
    setLoadState({ phase: "idle" });
  }, []);

  if (loadState.phase === "loading") {
    return <LoadingScreen />;
  }

  if (loadState.phase === "error") {
    return <ErrorScreen message={loadState.message} onReset={handleReset} />;
  }

  if (loadState.phase === "ready") {
    return <SpectatorPlayback events={loadState.events} />;
  }

  return <FilePickerScreen onLoad={handleLoad} />;
}
