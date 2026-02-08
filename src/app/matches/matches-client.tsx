"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import type { MatchListItem } from "@/lib/matches/types";

function formatStatus(status?: MatchListItem["status"] | null): string {
  if (!status) {
    return "unknown";
  }
  return status.status;
}

export default function MatchesClient({ matches }: { matches: MatchListItem[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
      render: (row) => (
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {formatStatus(row.status)}
        </span>
      ),
      sortable: true,
      sortValue: (row) => formatStatus(row.status),
    },
    {
      key: "agents",
      header: "Agents",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.summary.agentIds.map((agentId) => (
            <Badge key={agentId} variant="outline" className="text-xs">
              {agentId}
            </Badge>
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
