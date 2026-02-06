"use client";

import { use } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { CopyJsonButton } from "@/components/copy-json-button";
import { ArrowLeft, Shield, Zap, Clock } from "lucide-react";

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const { getAgent, getMatchesForAgent, getRunsForAgent } = useAppStore();

  const agent = getAgent(agentId);
  if (!agent) {
    return (
      <div className="space-y-4">
        <Link
          href="/agents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to agents
        </Link>
        <p className="text-sm text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  const agentMatches = getMatchesForAgent(agentId);
  const agentRuns = getRunsForAgent(agentId);
  const failedRuns = agentRuns.filter((r) => r.status === "failed");
  const completedRuns = agentRuns.filter((r) => r.status === "completed");
  const avgResponseMs =
    completedRuns.length > 0
      ? Math.round(
          completedRuns.reduce((sum, r) => sum + r.metrics.avgResponseMs, 0) /
            completedRuns.length,
        )
      : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/agents"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to agents
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {agent.avatar || agent.name[0]}
          </div>
          <div>
            <h1 className="text-lg font-bold">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">{agent.description}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {agent.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <CopyJsonButton data={agent} />
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4" />
              <p className="text-xs">Rating</p>
            </div>
            <p className="mt-1 text-2xl font-bold">{agent.rating}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="h-4 w-4" />
              <p className="text-xs">Reliability</p>
            </div>
            <p className="mt-1 text-2xl font-bold">
              {(agent.reliability * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <p className="text-xs">Avg Response</p>
            </div>
            <p className="mt-1 text-2xl font-bold">{avgResponseMs}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Run Stats</p>
            <p className="mt-1 text-2xl font-bold">
              {completedRuns.length}/{agentRuns.length}
            </p>
            <p className="text-xs text-muted-foreground">
              completed · {failedRuns.length} failed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {agent.capabilities.map((cap) => (
              <Badge key={cap} variant="secondary">
                {cap}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Matches */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Matches</CardTitle>
        </CardHeader>
        <CardContent>
          {agentMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches found.</p>
          ) : (
            <div className="space-y-2">
              {agentMatches.map((match) => (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{match.title}</p>
                    <p className="text-xs text-muted-foreground">{match.id}</p>
                  </div>
                  <MatchStatusBadge status={match.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {agentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs found.</p>
          ) : (
            <div className="space-y-2">
              {agentRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{run.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {run.metrics.actions} actions · {run.metrics.avgResponseMs}ms avg
                    </p>
                  </div>
                  <Badge
                    variant={
                      run.status === "completed"
                        ? "success"
                        : run.status === "failed"
                          ? "destructive"
                          : run.status === "running"
                            ? "info"
                            : "secondary"
                    }
                  >
                    {run.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
