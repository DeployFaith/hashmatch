import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Event } from "@/lib/models";
import {
  Play,
  Square,
  RotateCcw,
  Zap,
  Scale,
  RefreshCw,
  AlertTriangle,
  Eye,
  Flame,
  ShieldCheck,
} from "lucide-react";

const eventIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  match_started: Play,
  match_ended: Square,
  turn_started: RotateCcw,
  action_submitted: Zap,
  action_adjudicated: Scale,
  state_updated: RefreshCw,
  agent_error: AlertTriangle,
  observation_emitted: Eye,
  rule_triggered: Flame,
  invariant_checked: ShieldCheck,
};

const severityVariant: Record<string, "info" | "warning" | "destructive" | "success" | "default"> =
  {
    info: "info",
    warning: "warning",
    error: "destructive",
    critical: "destructive",
    success: "success",
  };

interface EventFeedProps {
  events: Event[];
  className?: string;
}

function fmtTimeUtc(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  // Deterministic across SSR + client: HH:MM:SS (UTC)
  return d.toISOString().slice(11, 19);
}

export function EventFeed({ events, className }: EventFeedProps) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border p-8 text-sm text-muted-foreground">
        No events recorded.
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {events.map((event) => {
        const Icon = eventIcons[event.type] || Zap;
        return (
          <div
            key={event.id}
            className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                event.severity === "critical" && "text-critical",
                event.severity === "error" && "text-destructive",
                event.severity === "warning" && "text-warning",
                event.severity === "success" && "text-success",
                event.severity === "info" && "text-info",
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{event.summary}</span>
                <Badge variant={severityVariant[event.severity] || "default"}>
                  {event.severity}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                  {fmtTimeUtc(event.ts)}
                </span>
              </div>
              {event.details && (
                <p className="mt-0.5 text-xs text-muted-foreground">{event.details}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
