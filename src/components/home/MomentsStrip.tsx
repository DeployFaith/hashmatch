"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ArrowRightLeft,
  RotateCcw,
  AlertTriangle,
  Zap,
  Timer,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseJsonl } from "@/lib/replay/parseJsonl";
import { detectMoments } from "@/lib/replay/detectMoments";
import type { ReplayMoment } from "@/lib/replay/detectMoments";
import { SAMPLE_JSONL } from "@/lib/replay/fixtures/sampleNumberGuess";

const MOMENT_META: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    borderColor: string;
    glowColor: string;
  }
> = {
  score_swing: {
    icon: TrendingUp,
    color: "text-purple-400",
    borderColor: "border-purple-500/40",
    glowColor: "rgba(192, 132, 252, 0.2)",
  },
  lead_change: {
    icon: ArrowRightLeft,
    color: "text-cyan-400",
    borderColor: "border-cyan-500/40",
    glowColor: "rgba(0, 229, 255, 0.2)",
  },
  comeback: {
    icon: RotateCcw,
    color: "text-orange-400",
    borderColor: "border-orange-500/40",
    glowColor: "rgba(251, 146, 60, 0.2)",
  },
  blunder: {
    icon: AlertTriangle,
    color: "text-red-400",
    borderColor: "border-red-500/40",
    glowColor: "rgba(248, 113, 113, 0.2)",
  },
  clutch: {
    icon: Zap,
    color: "text-green-400",
    borderColor: "border-green-500/40",
    glowColor: "rgba(74, 222, 128, 0.2)",
  },
  close_call: {
    icon: Timer,
    color: "text-yellow-400",
    borderColor: "border-yellow-500/40",
    glowColor: "rgba(250, 204, 21, 0.2)",
  },
};

const DEFAULT_META = {
  icon: Sparkles,
  color: "text-muted-foreground",
  borderColor: "border-border",
  glowColor: "transparent",
};

function getMeta(type: string) {
  return MOMENT_META[type] ?? DEFAULT_META;
}

function formatType(type: string) {
  return type.replace(/_/g, " ");
}

function MomentChipCard({ moment, scenarioName }: { moment: ReplayMoment; scenarioName: string }) {
  const meta = getMeta(moment.type);
  const Icon = meta.icon;
  const turn = typeof moment.startSeq === "number" ? `Seq ${moment.startSeq}` : undefined;

  return (
    <Link
      href={`/replay?seq=${moment.startSeq}`}
      className={cn(
        "group flex min-w-[220px] shrink-0 snap-start flex-col gap-2 rounded-lg border bg-card p-4 transition-all",
        meta.color,
        meta.borderColor,
        "hover:-translate-y-0.5",
      )}
      style={
        {
          "--glow-color": meta.glowColor,
        } as React.CSSProperties
      }
      title={moment.description ?? moment.label}
    >
      <div
        className="absolute inset-0 rounded-lg opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
        style={{ boxShadow: `0 0 24px var(--glow-color)` }}
      />
      <div className="relative flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          {formatType(moment.type)}
        </span>
      </div>
      <p className="relative text-sm text-foreground">{moment.label}</p>
      <div className="relative flex items-center gap-2 text-[10px] text-muted-foreground">
        {turn && <span>{turn}</span>}
        <span className="rounded bg-secondary px-1.5 py-0.5">{scenarioName}</span>
      </div>
    </Link>
  );
}

export function MomentsStrip() {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) {
      return;
    }
    const amount = 280;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <section className="px-6 py-20 sm:px-12 lg:px-24">
      <div className="mb-8 flex items-center gap-3">
        <Sparkles className="h-5 w-5" style={{ color: "#00e5ff" }} />
        <h2 className="text-lg font-bold">Key Moments</h2>
        <span className="text-sm text-muted-foreground">from the latest match</span>
      </div>

      {moments.length > 0 ? (
        <div className="relative">
          {/* Arrow buttons */}
          <button
            onClick={() => scroll("left")}
            className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin"
          >
            {moments.map((moment) => (
              <MomentChipCard key={moment.id} moment={moment} scenarioName={scenarioName} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
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
            style={{ color: "#00e5ff" }}
          >
            Get started with the docs
          </Link>
        </div>
      )}
    </section>
  );
}
