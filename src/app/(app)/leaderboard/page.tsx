"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/lib/models";
import { useRouter } from "next/navigation";

type FilterTag = string | "all";

export default function LeaderboardPage() {
  const { agents, getMatchesForAgent } = useAppStore();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterTag>("all");

  const allTags = Array.from(new Set(agents.flatMap((a) => a.tags)));
  const filtered = filter === "all" ? agents : agents.filter((a) => a.tags.includes(filter));

  const columns: Column<Agent>[] = [
    {
      key: "rank",
      header: "#",
      render: (_row: Agent) => {
        const sorted = [...agents].sort((a, b) => b.rating - a.rating);
        return sorted.findIndex((a) => a.id === _row.id) + 1;
      },
      sortable: true,
      sortValue: (row: Agent) => row.rating * -1,
    },
    {
      key: "name",
      header: "Agent",
      render: (row: Agent) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {row.avatar || row.name[0]}
          </div>
          <div>
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.tags.join(", ")}</p>
          </div>
        </div>
      ),
      sortable: true,
      sortValue: (row: Agent) => row.name,
    },
    {
      key: "rating",
      header: "Rating",
      render: (row: Agent) => <span className="font-mono font-bold">{row.rating}</span>,
      sortable: true,
      sortValue: (row: Agent) => row.rating,
    },
    {
      key: "reliability",
      header: "Reliability",
      render: (row: Agent) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${row.reliability * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {(row.reliability * 100).toFixed(0)}%
          </span>
        </div>
      ),
      sortable: true,
      sortValue: (row: Agent) => row.reliability,
    },
    {
      key: "matches",
      header: "Matches",
      render: (row: Agent) => getMatchesForAgent(row.id).length,
      sortable: true,
      sortValue: (row: Agent) => getMatchesForAgent(row.id).length,
    },
    {
      key: "capabilities",
      header: "Capabilities",
      render: (row: Agent) => (
        <div className="flex flex-wrap gap-1">
          {row.capabilities.slice(0, 2).map((c) => (
            <Badge key={c} variant="outline" className="text-xs">
              {c}
            </Badge>
          ))}
          {row.capabilities.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{row.capabilities.length - 2}
            </Badge>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Agent rankings by rating</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-md px-3 py-1 text-xs transition-colors ${
            filter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          All
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setFilter(tag)}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              filter === tag
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={[...filtered].sort((a, b) => b.rating - a.rating)}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => router.push(`/agents/${row.id}`)}
      />
    </div>
  );
}
