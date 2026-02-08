"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/models/match";

const SCENARIO_COLORS: Record<string, { bg: string; text: string }> = {
  heist: { bg: "rgba(0, 229, 255, 0.1)", text: "#00e5ff" },
  resourcerivals: { bg: "rgba(192, 132, 252, 0.1)", text: "#c084fc" },
  numberguess: { bg: "rgba(74, 222, 128, 0.1)", text: "#4ade80" },
};

function getScenarioStyle(rulesetId: string): { bg: string; text: string } {
  const key = rulesetId.toLowerCase().replace(/[-_\s]/g, "");
  return SCENARIO_COLORS[key] ?? { bg: "rgba(0, 229, 255, 0.1)", text: "#00e5ff" };
}

function getAgentNames(match: Match): [string, string] {
  const a = match.agents[0] ?? "Agent A";
  const b = match.agents[1] ?? "Agent B";
  return [a, b];
}

function getScenarioBadge(match: Match): string {
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

function getTurnCount(match: Match): number {
  return match.episodes.reduce((sum, ep) => sum + ep.eventIds.length, 0);
}

export function MatchCard({ match }: { match: Match }) {
  const [revealed, setRevealed] = useState(false);
  const [agentA, agentB] = getAgentNames(match);
  const scenario = getScenarioBadge(match);
  const outcome = getOutcome(match);
  const isCompleted = match.status === "completed";
  const scenarioStyle = getScenarioStyle(match.rulesetId);
  const turns = getTurnCount(match);

  return (
    <Link
      href={`/matches/${match.id}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all",
        "hover:border-[rgba(0,229,255,0.3)] hover:shadow-[0_0_24px_rgba(0,229,255,0.08)]",
      )}
    >
      {/* Scenario badge */}
      <div>
        <span
          className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: scenarioStyle.bg,
            color: scenarioStyle.text,
          }}
        >
          {scenario}
        </span>
      </div>

      {/* VS header */}
      <div className="flex items-center gap-3">
        <Swords className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-bold text-foreground">
          {agentA}
          <span className="mx-2 text-muted-foreground">vs</span>
          {agentB}
        </span>
      </div>

      {/* Turn count */}
      {turns > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {turns} event{turns !== 1 ? "s" : ""}
        </div>
      )}

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
                <span>Reveal outcome</span>
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
