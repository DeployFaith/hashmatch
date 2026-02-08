import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { FlowState, Transition } from "@/lib/models";
import { ArrowRight, Circle, CircleDot } from "lucide-react";

interface StateMachineViewerProps {
  states: FlowState[];
  transitions: Transition[];
  className?: string;
}

export function StateMachineViewer({ states, transitions, className }: StateMachineViewerProps) {
  const stateMap = new Map(states.map((s) => [s.id, s]));

  return (
    <div className={cn("space-y-4", className)}>
      {/* States */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          States
        </h4>
        <div className="flex flex-wrap gap-2">
          {states.map((state) => (
            <div
              key={state.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm",
                state.isInitial && "border-primary bg-primary/5",
                state.isTerminal && "border-success bg-success/5",
              )}
            >
              {state.isInitial ? (
                <CircleDot className="h-3 w-3 text-primary" />
              ) : (
                <Circle
                  className={cn(
                    "h-3 w-3",
                    state.isTerminal ? "text-success" : "text-muted-foreground",
                  )}
                />
              )}
              <span>{state.name}</span>
              {state.isInitial && (
                <Badge variant="info" className="ml-1">
                  initial
                </Badge>
              )}
              {state.isTerminal && (
                <Badge variant="success" className="ml-1">
                  terminal
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Transitions */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transitions
        </h4>
        <div className="space-y-1">
          {transitions.map((t) => {
            const from = stateMap.get(t.from);
            const to = stateMap.get(t.to);
            return (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{from?.name || t.from}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{to?.name || t.to}</span>
                <Badge variant="outline" className="ml-2">
                  {t.trigger}
                </Badge>
                {t.guard && (
                  <span className="ml-auto text-xs text-muted-foreground">guard: {t.guard}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
