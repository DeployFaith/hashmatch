"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/models/match";

// ---------------------------------------------------------------------------
// Derive display data from the Match model
// ---------------------------------------------------------------------------

function getAgentNames(match: Match): [string, string] {
  const a = match.agents[0] ?? "Agent A";
  const b = match.agents[1] ?? "Agent B";
  return [a, b];
}

function getScenarioBadge(match: Match): string {
  // rulesetId often contains the scenario identifier
  return match.rulesetId.replace(/[-_]/g, " ");
}

function getOutcome(match: Match): string | null {
  if (match.status !== "completed" || !match.score) {
    return null;
  }
  const entries = Object.entries(match.score);
  if (entries.length < 2) {
    return null;
  }
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] === entries[1][1]) {
    return "Draw";
  }
  return `${entries[0][0]} wins`;
}

// ---------------------------------------------------------------------------
// MatchCard
// ---------------------------------------------------------------------------

export function MatchCard({ match }: { match: Match }) {
  const [revealed, setRevealed] = useState(false);
  const [agentA, agentB] = getAgentNames(match);
  const scenario = getScenarioBadge(match);
  const outcome = getOutcome(match);
  const isCompleted = match.status === "completed";

  return (
    <Link
      href={`/matches/${match.id}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all",
        "hover:border-[rgba(0,240,255,0.3)] hover:shadow-[0_0_24px_rgba(0,240,255,0.08)]",
      )}
    >
      {/* VS header */}
      <div className="flex items-center gap-3">
        <Swords className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-bold text-foreground">
          {agentA}
          <span className="mx-2 text-muted-foreground">vs</span>
          {agentB}
        </span>
      </div>

      {/* Scenario badge */}
      <div>
        <span
          className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: "rgba(0, 240, 255, 0.1)",
            color: "#00f0ff",
          }}
        >
          {scenario}
        </span>
      </div>

      {/* Outcome with spoiler protection */}
      {isCompleted && outcome && (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setRevealed((r) => !r);
            }}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={revealed ? "Hide result" : "Reveal result"}
          >
            {revealed ? (
              <>
                <EyeOff className="h-3 w-3" />
                <span className="font-medium text-foreground">{outcome}</span>
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                <span>Reveal result</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Status for non-completed matches */}
      {!isCompleted && (
        <div className="text-xs text-muted-foreground">
          {match.status === "in_progress" && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              Live
            </span>
          )}
          {match.status === "scheduled" && "Scheduled"}
          {match.status === "cancelled" && "Cancelled"}
          {match.status === "error" && "Error"}
        </div>
      )}
    </Link>
  );
}
