import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentProfileType, AgentRecord } from "@/lib/matches/types";

// ---------------------------------------------------------------------------
// AgentTypeBadge — renders a small badge for the agent classification
// ---------------------------------------------------------------------------

const typeLabels: Record<AgentProfileType, string> = {
  scripted: "Scripted",
  llm: "LLM",
  http: "HTTP",
};

const typeBadgeVariants: Record<AgentProfileType, "secondary" | "info" | "default"> = {
  scripted: "secondary",
  llm: "info",
  http: "default",
};

function AgentTypeBadge({ type }: { type?: AgentProfileType }) {
  const label = type ? typeLabels[type] : "Unknown";
  const variant = type ? typeBadgeVariants[type] : "secondary";
  return (
    <Badge variant={variant} className="text-[10px] px-1.5 py-0">
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Record display — W-L-D
// ---------------------------------------------------------------------------

function RecordDisplay({ record }: { record?: AgentRecord }) {
  if (!record) {
    return <span className="text-xs text-muted-foreground">{"\u2014"}</span>;
  }
  return (
    <span className="text-xs font-mono">
      <span className="text-green-400">{record.wins}</span>
      {"-"}
      <span className="text-red-400">{record.losses}</span>
      {"-"}
      <span className="text-muted-foreground">{record.draws}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// AgentCard props
// ---------------------------------------------------------------------------

export interface AgentCardProps {
  name: string;
  type?: AgentProfileType;
  record?: AgentRecord;
  score?: number | null;
  variant?: "compact" | "expanded";
  className?: string;
}

// ---------------------------------------------------------------------------
// AgentCard — compact shows avatar + name + type inline;
//             expanded shows a card with all four contract fields.
// ---------------------------------------------------------------------------

export function AgentCard({
  name,
  type,
  record,
  score,
  variant = "expanded",
  className,
}: AgentCardProps) {
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
          {name[0]?.toUpperCase() ?? "?"}
        </div>
        <span className="text-sm font-medium truncate">{name}</span>
        <AgentTypeBadge type={type} />
      </div>
    );
  }

  // expanded variant
  return (
    <div className={cn("rounded-md border border-border bg-card p-3 space-y-2", className)}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary shrink-0">
          {name[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{name}</p>
          <AgentTypeBadge type={type} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-muted-foreground">Record </span>
          <RecordDisplay record={record} />
        </div>
        <div>
          <span className="text-muted-foreground">Score </span>
          <span className="font-mono font-bold">
            {score !== undefined && score !== null ? score : "\u2014"}
          </span>
        </div>
      </div>
    </div>
  );
}
