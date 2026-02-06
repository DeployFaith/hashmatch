"use client";

import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { ReplayLoader } from "@/components/replay-loader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink } from "lucide-react";

export default function ReplayPage() {
  const { matches, replayMeta, clearReplay } = useAppStore();

  // Get all replay matches
  const replayMatches = matches.filter((m) => m.id in replayMeta);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Replay Viewer</h1>
        <p className="text-sm text-muted-foreground">
          Load and inspect JSONL engine event logs as spectator-friendly timelines
        </p>
      </div>

      <ReplayLoader />

      {/* Loaded replays list */}
      {replayMatches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Loaded Replays</h2>
          {replayMatches.map((match) => {
            const meta = replayMeta[match.id];
            return (
              <Card key={match.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{match.title}</p>
                      <Badge variant="outline" className="text-xs">
                        replay
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {meta?.matchId} · {meta?.agentIds.join(" vs ")} ·{" "}
                      {meta?.totalTurns} turns
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/matches/${match.id}`}>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-3 w-3" />
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearReplay(match.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
