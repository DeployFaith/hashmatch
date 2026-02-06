"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { DataTable, type Column } from "@/components/data-table";
import { MatchStatusBadge } from "@/components/match-status-badge";
import type { Match, MatchStatus } from "@/lib/models";
import { Badge } from "@/components/ui/badge";

export default function MatchesPage() {
  const { matches, getAgent } = useAppStore();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<MatchStatus | "all">("all");

  const filtered =
    statusFilter === "all" ? matches : matches.filter((m) => m.status === statusFilter);

  const statuses: (MatchStatus | "all")[] = [
    "all",
    "in_progress",
    "scheduled",
    "completed",
    "cancelled",
    "error",
  ];

  const columns: Column<Match>[] = [
    {
      key: "title",
      header: "Match",
      render: (row: Match) => (
        <div>
          <p className="font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">{row.id}</p>
        </div>
      ),
      sortable: true,
      sortValue: (row: Match) => row.title,
    },
    {
      key: "status",
      header: "Status",
      render: (row: Match) => <MatchStatusBadge status={row.status} />,
      sortable: true,
      sortValue: (row: Match) => row.status,
    },
    {
      key: "agents",
      header: "Agents",
      render: (row: Match) => (
        <div className="flex flex-wrap gap-1">
          {row.agents.map((agentId) => {
            const agent = getAgent(agentId);
            return (
              <Badge key={agentId} variant="outline" className="text-xs">
                {agent?.name || agentId}
              </Badge>
            );
          })}
        </div>
      ),
    },
    {
      key: "episodes",
      header: "Episodes",
      render: (row: Match) => row.episodes.length,
      sortable: true,
      sortValue: (row: Match) => row.episodes.length,
    },
    {
      key: "startedAt",
      header: "Started",
      render: (row: Match) =>
        row.startedAt ? new Date(row.startedAt).toLocaleString() : "\u2014",
      sortable: true,
      sortValue: (row: Match) =>
        row.startedAt ? new Date(row.startedAt).getTime() : 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Matches</h1>
        <p className="text-sm text-muted-foreground">All matches across the arena</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => router.push(`/matches/${row.id}`)}
      />
    </div>
  );
}
