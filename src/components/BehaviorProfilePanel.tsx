"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types — aligned with the canonical FailureModeProfile shape from @/lib/fm
// (mirrored here to keep the panel self-contained without importing engine code)
// ---------------------------------------------------------------------------

interface FailureModeHitEntry {
  id: `FM-${string}`;
  count: number;
  rate?: number;
  detectorSource: "core" | `scenario:${string}`;
}

interface FailureModeProfileEntry {
  fmClassifierVersion: string;
  byAgentId: Record<string, FailureModeHitEntry[]>;
}

type FmParseResult =
  | { status: "present"; data: FailureModeProfileEntry }
  | { status: "invalid"; raw: unknown }
  | { status: "absent" };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VISIBLE_COUNT = 5;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentFmSection({
  agentId,
  entries,
}: {
  agentId: string;
  entries: FailureModeHitEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...entries].sort((a, b) => b.count - a.count);
  const totalHits = sorted.reduce((sum, e) => sum + e.count, 0);
  const visible = expanded ? sorted : sorted.slice(0, DEFAULT_VISIBLE_COUNT);
  const hasMore = sorted.length > DEFAULT_VISIBLE_COUNT;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{agentId}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {totalHits} total
        </Badge>
      </div>

      {sorted.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No failure modes recorded.</p>
      ) : (
        <>
          <div className="space-y-0.5">
            {visible.map((fm) => (
              <div
                key={fm.id}
                className="flex items-center justify-between rounded px-2 py-1 text-[11px] bg-muted/30"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono truncate" title={fm.id}>
                    {fm.id}
                  </span>
                  <span
                    className="text-[9px] text-muted-foreground/60 shrink-0"
                    title={`Detector: ${fm.detectorSource}`}
                  >
                    [{fm.detectorSource}]
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="font-mono font-medium">{fm.count}</span>
                  {fm.rate !== undefined && (
                    <span className="text-[9px] text-muted-foreground">
                      ({(fm.rate * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show all {sorted.length}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function BehaviorProfilePanel({ fmResult }: { fmResult: FmParseResult }) {
  if (fmResult.status === "absent") {
    return null;
  }

  if (fmResult.status === "invalid") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Behavior Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <div>
              <p className="font-medium">FM telemetry invalid</p>
              <pre
                className={cn(
                  "mt-1 max-h-24 overflow-auto rounded bg-muted/30 p-1.5 text-[10px]",
                  "text-muted-foreground font-mono whitespace-pre-wrap break-all",
                )}
              >
                {JSON.stringify(fmResult.raw, null, 2)}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { data } = fmResult;
  const agentIds = Object.keys(data.byAgentId).sort();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4" />
          Behavior Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            Classifier:{" "}
            <span className="font-mono text-foreground/70">{data.fmClassifierVersion}</span>
          </span>
        </div>

        {agentIds.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No agent FM data in this snapshot.</p>
        ) : (
          <div className="space-y-3 divide-y divide-border">
            {agentIds.map((agentId) => (
              <div key={agentId} className={cn(agentIds.indexOf(agentId) > 0 && "pt-3")}>
                <AgentFmSection agentId={agentId} entries={data.byAgentId[agentId]} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
