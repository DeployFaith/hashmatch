import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Episode, Event } from "@/lib/models";

interface TimelineProps {
  episodes: Episode[];
  events: Event[];
  className?: string;
}

export function Timeline({ episodes, events, className }: TimelineProps) {
  const eventMap = new Map(events.map((e) => [e.id, e]));

  if (episodes.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border p-8 text-sm text-muted-foreground">
        No episodes recorded.
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {episodes.map((episode, epIdx) => (
        <div key={episode.id}>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {epIdx + 1}
            </div>
            <h3 className="text-sm font-semibold">{episode.title}</h3>
            <span className="text-xs text-muted-foreground">
              {new Date(episode.startedAt).toLocaleString()}
            </span>
          </div>
          <div className="ml-3 border-l-2 border-border pl-6 space-y-2">
            {episode.eventIds.map((eventId) => {
              const event = eventMap.get(eventId);
              if (!event) {
                return null;
              }
              return (
                <div key={event.id} className="relative">
                  <div className="absolute -left-[29px] top-2 h-2 w-2 rounded-full bg-border" />
                  <div className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{event.summary}</span>
                      <Badge
                        variant={
                          event.severity === "success"
                            ? "success"
                            : event.severity === "warning"
                              ? "warning"
                              : event.severity === "error" || event.severity === "critical"
                                ? "destructive"
                                : "info"
                        }
                      >
                        {event.type.replace(/_/g, " ")}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(event.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    {event.details && (
                      <p className="mt-1 text-xs text-muted-foreground">{event.details}</p>
                    )}
                    {event.invariantChecks && event.invariantChecks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {event.invariantChecks.map((check, i) => (
                          <Badge
                            key={i}
                            variant={
                              check.status === "pass"
                                ? "success"
                                : check.status === "fail"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {check.name}: {check.status.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
