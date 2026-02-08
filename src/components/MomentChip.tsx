import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Moment type → color mapping (spec-required)
//
// score_swing → orange
// lead_change → blue
// comeback    → green
// blunder     → red
// clutch      → gold (yellow)
// close_call  → purple
// unknown     → gray (neutral)
// ---------------------------------------------------------------------------

export interface MomentTypeStyle {
  /** Tailwind classes for a small badge/chip (background + text + border). */
  badge: string;
  /** Tailwind border class for card outlines. */
  bg: string;
  /** Tailwind class for a small dot indicator. */
  dot: string;
}

export const momentTypeStyles: Record<string, MomentTypeStyle> = {
  score_swing: {
    badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    bg: "border-orange-500/20",
    dot: "bg-orange-400",
  },
  lead_change: {
    badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    bg: "border-blue-500/20",
    dot: "bg-blue-400",
  },
  comeback: {
    badge: "bg-green-500/20 text-green-400 border-green-500/30",
    bg: "border-green-500/20",
    dot: "bg-green-400",
  },
  blunder: {
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
    bg: "border-red-500/20",
    dot: "bg-red-400",
  },
  clutch: {
    badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    bg: "border-yellow-500/20",
    dot: "bg-yellow-400",
  },
  close_call: {
    badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    bg: "border-purple-500/20",
    dot: "bg-purple-400",
  },
};

const neutralStyle: MomentTypeStyle = {
  badge: "bg-muted text-muted-foreground border-border",
  bg: "border-border",
  dot: "bg-muted-foreground",
};

/** Resolve a moment type string to its style, falling back to neutral for unknowns. */
export function getMomentStyle(type: string): MomentTypeStyle {
  return momentTypeStyles[type] ?? neutralStyle;
}

// ---------------------------------------------------------------------------
// MomentChip — a small colored indicator for a moment type
// ---------------------------------------------------------------------------

export interface MomentChipProps {
  /** The moment type (e.g. "score_swing", "blunder"). */
  type: string;
  /** Optional className override. */
  className?: string;
}

/**
 * Renders a small colored badge chip showing the moment type label.
 * Color is determined by the spec-required mapping.
 */
export function MomentChip({ type, className }: MomentChipProps) {
  const style = getMomentStyle(type);
  return (
    <span
      className={cn(
        "inline-block rounded px-1 py-0 text-[9px] font-medium border",
        style.badge,
        className,
      )}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}

/**
 * Renders a small colored dot for inline moment type indication.
 */
export function MomentDot({ type, className }: MomentChipProps) {
  const style = getMomentStyle(type);
  return (
    <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", style.dot, className)} />
  );
}
