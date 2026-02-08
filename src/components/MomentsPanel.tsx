import { cn } from "@/lib/utils";
import { MomentChip, getMomentStyle } from "@/components/MomentChip";
import type { ReplayMoment, MomentEventRangeMap } from "@/lib/replay/detectMoments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a safe label for a moment, avoiding any UI-generated analysis text. */
function safeMomentLabel(moment: ReplayMoment, spoilers: boolean): string {
  if (spoilers && moment.description) {
    return moment.description;
  }
  // Spectator-safe: show type + involved agents if available, but not scores.
  const agentId =
    typeof moment.signals.agentId === "string"
      ? moment.signals.agentId
      : typeof moment.signals.winner === "string"
        ? moment.signals.winner
        : typeof moment.signals.newLeader === "string"
          ? moment.signals.newLeader
          : null;
  const turnInfo =
    typeof moment.signals.decisiveTurn === "number"
      ? ` at turn ${moment.signals.decisiveTurn}`
      : "";
  const suffix = agentId ? ` — ${agentId}${turnInfo}` : turnInfo;
  return `${moment.label}${suffix}`;
}

/** Build a fallback label when moment.label is missing. */
function fallbackLabel(moment: ReplayMoment): string {
  if (moment.label) {
    return moment.label;
  }
  // Derive from what we have
  const turn = typeof moment.signals.decisiveTurn === "number" ? moment.signals.decisiveTurn : null;
  if (turn !== null) {
    return `Moment @ Turn ${turn}`;
  }
  return `Moment @ Event ${moment.startSeq}`;
}

// ---------------------------------------------------------------------------
// MomentsPanel
// ---------------------------------------------------------------------------

export interface MomentsPanelProps {
  /** The list of moments to display. */
  moments: ReplayMoment[];
  /** Map of moment IDs to their event index ranges. */
  momentRanges: MomentEventRangeMap;
  /** Callback when a moment is selected (for jumping). */
  onSelectMoment: (moment: ReplayMoment) => void;
  /** The currently active moment (based on playhead position), if any. */
  activeMomentId?: string | null;
  /** Whether spoilers are enabled (shows full descriptions). */
  spoilers?: boolean;
}

/**
 * A compact panel listing all moments in a replay, color-coded by type.
 * Clicking a moment triggers the onSelectMoment callback for jumping.
 * Shows nothing (no empty chrome) when there are no moments.
 */
export function MomentsPanel({
  moments,
  momentRanges,
  onSelectMoment,
  activeMomentId,
  spoilers = false,
}: MomentsPanelProps) {
  if (moments.length === 0) {
    return <p className="text-xs text-muted-foreground">No moments detected.</p>;
  }

  return (
    <div className="space-y-1.5">
      {moments.map((moment) => {
        const isActive = moment.id === activeMomentId;
        const range = momentRanges.get(moment.id);
        const style = getMomentStyle(moment.type);
        const label = fallbackLabel(moment);
        const description = safeMomentLabel({ ...moment, label }, spoilers);

        return (
          <button
            key={moment.id}
            type="button"
            onClick={() => onSelectMoment(moment)}
            className={cn(
              "w-full rounded-md border px-2 py-1.5 text-left text-xs transition",
              "hover:bg-muted/40",
              isActive ? "border-primary/40 bg-primary/10 text-primary" : style.bg,
            )}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <MomentChip type={moment.type} />
              {typeof moment.signals.agentId === "string" && (
                <span className="text-[9px] text-muted-foreground truncate">
                  {moment.signals.agentId}
                </span>
              )}
            </div>
            <p className="font-medium">{description}</p>
            <p className="text-[0.7rem] text-muted-foreground">
              {range
                ? `Events ${range.startEventIdx + 1}\u2013${range.endEventIdx + 1}`
                : `Seq ${moment.startSeq}\u2013${moment.endSeq}`}
            </p>
          </button>
        );
      })}
    </div>
  );
}
