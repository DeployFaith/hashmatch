"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/data-table";
import { AgentCard } from "@/components/AgentCard";
import { Badge } from "@/components/ui/badge";
import type { MatchListItem } from "@/lib/matches/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function formatStatus(status?: MatchListItem["status"] | null): string {
  if (!status) {
    return "unknown";
  }
  return status.status;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "running":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-red-500/40 text-red-400 text-[10px] uppercase tracking-wider"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          LIVE
        </Badge>
      );
    case "completed":
    case "complete":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-green-500/40 text-green-400 text-[10px] uppercase tracking-wider"
        >
          {"\u2705"} Complete
        </Badge>
      );
    case "crashed":
    case "failed":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-red-500/40 text-red-400 text-[10px] uppercase tracking-wider"
        >
          {"\u274c"} Failed
        </Badge>
      );
    default:
      return (
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{status}</span>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MatchesClient({ matches: initialMatches }: { matches: MatchListItem[] }) {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchListItem[]>(initialMatches);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Poll for new matches every 5 seconds
  const pollMatches = useCallback(async () => {
    try {
      const res = await fetch("/api/matches");
      if (res.ok) {
        const data = (await res.json()) as MatchListItem[];
        if (Array.isArray(data)) {
          setMatches(data);
        }
      }
    } catch {
      // Network error — keep existing data
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(pollMatches, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollMatches]);

  const statuses = useMemo(() => {
    const unique = new Set<string>();
    matches.forEach((match) => {
      unique.add(formatStatus(match.status));
    });
    return ["all", ...Array.from(unique).sort()];
  }, [matches]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") {
      return matches;
    }
    return matches.filter((match) => formatStatus(match.status) === statusFilter);
  }, [matches, statusFilter]);

  const columns: Column<MatchListItem>[] = [
    {
      key: "match",
      header: "Match",
      render: (row) => (
        <div>
          <p className="font-medium">{row.matchId}</p>
          <p className="text-xs text-muted-foreground">{row.scenarioName ?? "Unknown"}</p>
        </div>
      ),
      sortable: true,
      sortValue: (row) => row.matchId,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={formatStatus(row.status)} />,
      sortable: true,
      sortValue: (row) => formatStatus(row.status),
    },
    {
      key: "agents",
      header: "Agents",
      render: (row) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {row.summary.agentIds.map((agentId, i) => (
            <span key={agentId} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[10px] text-muted-foreground font-medium">vs</span>}
              <AgentCard name={agentId} variant="compact" />
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "turns",
      header: "Turns",
      render: (row) => row.summary.turns,
      sortable: true,
      sortValue: (row) => row.summary.turns,
    },
    {
      key: "winner",
      header: "Winner",
      render: (row) => row.summary.winner ?? "\u2014",
      sortable: true,
      sortValue: (row) => row.summary.winner ?? "",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Matches</h1>
        <p className="text-sm text-muted-foreground">All matches across the arena</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              statusFilter === status
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {status === "all" ? "All" : status.replace("_", " ")}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(row) => row.matchId}
        onRowClick={(row) => router.push(`/matches/${row.matchId}`)}
      />
    </div>
  );
}
