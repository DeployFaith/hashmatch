"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/lib/models";

export default function AgentsPage() {
  const { agents } = useAppStore();
  const router = useRouter();

  const columns: Column<Agent>[] = [
    {
      key: "name",
      header: "Agent",
      render: (row: Agent) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {row.avatar || row.name[0]}
          </div>
          <div>
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.id}</p>
          </div>
        </div>
      ),
      sortable: true,
      sortValue: (row: Agent) => row.name,
    },
    {
      key: "description",
      header: "Description",
      render: (row: Agent) => (
        <p className="max-w-xs truncate text-muted-foreground">{row.description}</p>
      ),
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
        <span className="font-mono">{(row.reliability * 100).toFixed(0)}%</span>
      ),
      sortable: true,
      sortValue: (row: Agent) => row.reliability,
    },
    {
      key: "tags",
      header: "Tags",
      render: (row: Agent) => (
        <div className="flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "lastSeen",
      header: "Last Seen",
      render: (row: Agent) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.lastSeen).toLocaleString()}
        </span>
      ),
      sortable: true,
      sortValue: (row: Agent) => new Date(row.lastSeen).getTime(),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Agents</h1>
        <p className="text-sm text-muted-foreground">Agent directory — all registered agents</p>
      </div>

      <DataTable
        columns={columns}
        data={agents}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => router.push(`/agents/${row.id}`)}
      />
    </div>
  );
}
