"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { Timeline } from "@/components/timeline";
import { EventFeed } from "@/components/event-feed";
import { CopyJsonButton } from "@/components/copy-json-button";
import { InvariantBadge } from "@/components/invariant-badge";
import {
  EventFilterBar,
  applyFilters,
  filterEpisodes,
  EMPTY_FILTERS,
} from "@/components/event-filter-bar";
import type { EventFilters } from "@/components/event-filter-bar";
import { ArrowLeft, Copy, Check, GitCommit, Tag } from "lucide-react";
import type { Run, Agent } from "@/lib/models";

function CopyInlineButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const { getMatch, getAgent, getEventsForMatch, getRunsForMatch, getReplayMeta, isReplayMatch } =
    useAppStore();

  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);

  const match = getMatch(matchId);
  const isReplay = isReplayMatch(matchId);
  const replayMeta = isReplay ? getReplayMeta(matchId) : undefined;

  if (!match) {
    return (
      <div className="space-y-4">
        <Link
          href="/matches"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to matches
        </Link>
        <p className="text-sm text-muted-foreground">Match not found.</p>
      </div>
    );
  }

  const matchEvents = getEventsForMatch(matchId);
  const matchRuns = getRunsForMatch(matchId);
  const matchAgents = match.agents.map((id) => getAgent(id)).filter(Boolean) as Agent[];

  // Collect all invariant checks from events
  const allInvariantChecks = matchEvents.flatMap((e) => e.invariantChecks || []);

  // Filtering
  const filteredEvents = useMemo(() => applyFilters(matchEvents, filters), [matchEvents, filters]);
  const filteredEventIds = useMemo(() => new Set(filteredEvents.map((e) => e.id)), [filteredEvents]);
  const filteredEpisodes = useMemo(
    () => filterEpisodes(match.episodes, filteredEventIds, filters.turn),
    [match.episodes, filteredEventIds, filters.turn],
  );

  return (
    <div className="space-y-6">
      <Link
        href={isReplay ? "/replay" : "/matches"}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {isReplay ? "Back to replays" : "Back to matches"}
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">{match.title}</h1>
            <MatchStatusBadge status={match.status} />
            {isReplay && (
              <Badge variant="outline" className="text-xs">
                replay
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {match.id} · Ruleset: {match.rulesetId}
          </p>
        </div>
        <CopyJsonButton data={match} />
      </div>

      {/* Provenance bar for replay matches */}
      {isReplay && replayMeta && (replayMeta.engineVersion || replayMeta.engineCommit) && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/30 px-4 py-2 text-xs">
          {replayMeta.engineVersion && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Tag className="h-3 w-3" />
              Engine:{" "}
              <span className="font-mono font-medium text-foreground">
                {replayMeta.engineVersion}
              </span>
              <CopyInlineButton text={replayMeta.engineVersion} />
            </span>
          )}
          {replayMeta.engineCommit && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <GitCommit className="h-3 w-3" />
              Commit:{" "}
              <span className="font-mono font-medium text-foreground">
                {replayMeta.engineCommit}
              </span>
              <CopyInlineButton text={replayMeta.engineCommit} />
            </span>
          )}
          {replayMeta.seed !== undefined && (
            <span className="text-muted-foreground">
              Seed:{" "}
              <span className="font-mono font-medium text-foreground">{replayMeta.seed}</span>
            </span>
          )}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Match Info</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <MatchStatusBadge status={match.status} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Agents</dt>
                    <dd>{match.agents.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Episodes</dt>
                    <dd>{match.episodes.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Events</dt>
                    <dd>{matchEvents.length}</dd>
                  </div>
                  {isReplay && replayMeta && (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Scenario</dt>
                        <dd>{replayMeta.scenarioName}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Seed</dt>
                        <dd className="font-mono">{replayMeta.seed}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Max Turns</dt>
                        <dd>{replayMeta.maxTurns}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Actual Turns</dt>
                        <dd>{replayMeta.totalTurns}</dd>
                      </div>
                      {replayMeta.endReason && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">End Reason</dt>
                          <dd>{replayMeta.endReason}</dd>
                        </div>
                      )}
                    </>
                  )}
                  {match.startedAt && !isReplay && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Started</dt>
                      <dd>{new Date(match.startedAt).toLocaleString()}</dd>
                    </div>
                  )}
                  {match.endedAt && !isReplay && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Ended</dt>
                      <dd>{new Date(match.endedAt).toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Scores */}
            {match.score && (
              <Card>
                <CardHeader>
                  <CardTitle>Scores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(match.score).map(([agentId, score]) => {
                      const agent = getAgent(agentId);
                      return (
                        <div key={agentId} className="flex items-center justify-between text-sm">
                          <span className="font-medium">{agent?.name || agentId}</span>
                          <span className="font-mono font-bold">{score}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Invariant Summary */}
            {allInvariantChecks.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Invariant Checks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {allInvariantChecks.map((check, i) => (
                      <InvariantBadge
                        key={i}
                        name={check.name}
                        status={check.status}
                        message={check.message}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <div className="space-y-4">
            <EventFilterBar
              events={matchEvents}
              agentIds={match.agents}
              maxTurn={replayMeta?.totalTurns ?? match.episodes.length}
              filters={filters}
              onFiltersChange={setFilters}
            />
            <div className="text-xs text-muted-foreground">
              Showing {filteredEvents.length} of {matchEvents.length} events
            </div>
            <Timeline episodes={filteredEpisodes} events={filteredEvents} />
            {filteredEvents.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Event Feed</h3>
                <EventFeed events={filteredEvents} />
              </div>
            )}
          </div>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents">
          {isReplay && matchAgents.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {match.agents.map((agentId) => (
                <Card key={agentId}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {agentId[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <CardTitle>{agentId}</CardTitle>
                        <p className="text-xs text-muted-foreground">Replay participant</p>
                      </div>
                    </div>
                  </CardHeader>
                  {match.score && match.score[agentId] !== undefined && (
                    <CardContent>
                      <p className="text-sm">
                        Score:{" "}
                        <span className="font-mono font-bold">{match.score[agentId]}</span>
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {matchAgents.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.id}`}>
                  <Card className="transition-colors hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {agent.avatar || agent.name[0]}
                        </div>
                        <div>
                          <CardTitle>{agent.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Rating: {agent.rating} · Reliability:{" "}
                            {(agent.reliability * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {agent.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Runs Tab */}
        <TabsContent value="runs">
          {matchRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isReplay
                ? "Run-level data is not available in replay files."
                : "No runs recorded for this match."}
            </p>
          ) : (
            <div className="space-y-3">
              {matchRuns.map((run: Run) => {
                const agent = getAgent(run.agentId);
                return (
                  <Card key={run.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{agent?.name || run.agentId}</p>
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
                          <p className="text-xs text-muted-foreground">{run.id}</p>
                        </div>
                        <CopyJsonButton data={run} label="Copy" />
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Actions</p>
                          <p className="font-mono">{run.metrics.actions}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Errors</p>
                          <p className="font-mono">{run.metrics.errors}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Avg Response</p>
                          <p className="font-mono">{run.metrics.avgResponseMs}ms</p>
                        </div>
                        {run.metrics.score !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground">Score</p>
                            <p className="font-mono font-bold">{run.metrics.score}</p>
                          </div>
                        )}
                      </div>
                      {run.logs.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1 text-xs text-muted-foreground">Logs</p>
                          <div className="max-h-32 overflow-y-auto rounded bg-muted p-2 text-xs font-mono">
                            {run.logs.map((log, i) => (
                              <div key={i} className="text-muted-foreground">
                                {log}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
