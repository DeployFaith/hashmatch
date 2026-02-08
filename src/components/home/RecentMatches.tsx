"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { MatchCard } from "./MatchCard";

export function RecentMatches() {
  const { matches } = useAppStore();
  const recentMatches = matches.slice(0, 6);

  return (
    <section className="py-12">
      <div className="mb-6 flex items-center gap-3">
        <Swords className="h-5 w-5" style={{ color: "#00f0ff" }} />
        <h2 className="text-lg font-bold">Recent Matches</h2>
      </div>

      {recentMatches.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recentMatches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <Swords className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">No matches yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run your first tournament to see match results here
          </p>
          <Link
            href="https://github.com/DeployFaith/hashmatch"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-xs font-medium transition-colors hover:underline"
            style={{ color: "#00f0ff" }}
          >
            Run your first tournament
          </Link>
        </div>
      )}
    </section>
  );
}
