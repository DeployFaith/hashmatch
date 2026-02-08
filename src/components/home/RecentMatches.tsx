"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { MatchCard } from "./MatchCard";

export function RecentMatches() {
  const { matches } = useAppStore();
  const recentMatches = matches.slice(0, 6);

  return (
    <section className="px-6 py-20 sm:px-12 lg:px-24">
      <div className="mb-8 flex items-center gap-3">
        <Swords className="h-5 w-5" style={{ color: "#00e5ff" }} />
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
          <p className="mt-2 max-w-xs text-xs text-muted-foreground">
            Run your first tournament to see match results here
          </p>
          <pre className="mt-4 rounded bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
            npm run tournament -- --seed 42
          </pre>
          <Link
            href="https://github.com/DeployFaith/hashmatch"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-xs font-medium transition-colors hover:underline"
            style={{ color: "#00e5ff" }}
          >
            Read the docs
          </Link>
        </div>
      )}
    </section>
  );
}
