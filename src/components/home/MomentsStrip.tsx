"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ArrowRightLeft,
  RotateCcw,
  AlertTriangle,
  Zap,
  Timer,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseJsonl } from "@/lib/replay/parseJsonl";
import { detectMoments } from "@/lib/replay/detectMoments";
import type { ReplayMoment } from "@/lib/replay/detectMoments";
import { SAMPLE_JSONL } from "@/lib/replay/fixtures/sampleNumberGuess";

// ---------------------------------------------------------------------------
// Moment type → icon + color
// ---------------------------------------------------------------------------

const MOMENT_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; glow: string }
> = {
  score_swing: {
    icon: TrendingUp,
    color: "text-orange-400 border-orange-500/40",
    glow: "hover:shadow-[0_0_20px_rgba(251,146,60,0.15)]",
  },
  lead_change: {
    icon: ArrowRightLeft,
    color: "text-cyan-400 border-cyan-500/40",
    glow: "hover:shadow-[0_0_20px_rgba(0,240,255,0.15)]",
  },
  comeback: {
    icon: RotateCcw,
    color: "text-green-400 border-green-500/40",
    glow: "hover:shadow-[0_0_20px_rgba(74,222,128,0.15)]",
  },
  blunder: {
    icon: AlertTriangle,
    color: "text-red-400 border-red-500/40",
    glow: "hover:shadow-[0_0_20px_rgba(248,113,113,0.15)]",
  },
  clutch: {
    icon: Zap,
    color: "text-yellow-400 border-yellow-500/40",
    glow: "hover:shadow-[0_0_20px_rgba(250,204,21,0.15)]",
  },
  close_call: {
    icon: Timer,
    color: "text-purple-400 border-purple-500/40",
    glow: "hover:shadow-[0_0_20px_rgba(192,132,252,0.15)]",
  },
};

const DEFAULT_META = {
  icon: Sparkles,
  color: "text-muted-foreground border-border",
  glow: "",
};

function getMeta(type: string) {
  return MOMENT_META[type] ?? DEFAULT_META;
}

function formatType(type: string) {
  return type.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// MomentChipCard
// ---------------------------------------------------------------------------

function MomentChipCard({ moment, scenarioName }: { moment: ReplayMoment; scenarioName: string }) {
  const meta = getMeta(moment.type);
  const Icon = meta.icon;
  const turn = typeof moment.startSeq === "number" ? `Seq ${moment.startSeq}` : undefined;

  return (
    <Link
      href="/replay"
      className={cn(
        "flex min-w-[200px] shrink-0 snap-start flex-col gap-2 rounded-lg border bg-card p-4 transition-all",
        meta.color,
        meta.glow,
      )}
      title={moment.description ?? moment.label}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          {formatType(moment.type)}
        </span>
      </div>
      <p className="text-sm text-foreground">{moment.label}</p>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {turn && <span>{turn}</span>}
        <span className="rounded bg-secondary px-1.5 py-0.5">{scenarioName}</span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// MomentsStrip
// ---------------------------------------------------------------------------

export function MomentsStrip() {
  const { moments, scenarioName } = useMemo(() => {
    const { events } = parseJsonl(SAMPLE_JSONL);
    if (events.length === 0) {
      return { moments: [] as ReplayMoment[], scenarioName: "Unknown" };
    }

    const startEvent = events.find((e) => e.type === "MatchStarted");
    const name =
      typeof startEvent?.raw?.scenarioName === "string" ? startEvent.raw.scenarioName : "Unknown";

    const detected = detectMoments(events);
    return { moments: detected, scenarioName: name };
  }, []);

  return (
    <section className="-mx-6 px-6 py-12">
      <div className="mb-6 flex items-center gap-3">
        <Sparkles className="h-5 w-5" style={{ color: "#00f0ff" }} />
        <h2 className="text-lg font-bold">Key Moments</h2>
        <span className="text-sm text-muted-foreground">from the latest match</span>
      </div>

      {moments.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin">
          {moments.map((moment) => (
            <MomentChipCard key={moment.id} moment={moment} scenarioName={scenarioName} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <Sparkles className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">No moments detected yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run a tournament to see highlights here
          </p>
          <Link
            href="https://github.com/DeployFaith/hashmatch"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-xs font-medium transition-colors hover:underline"
            style={{ color: "#00f0ff" }}
          >
            Get started with the docs
          </Link>
        </div>
      )}
    </section>
  );
}
