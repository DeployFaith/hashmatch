"use client";

import type { CollapsedMomentCard } from "./momentTemplates";

const REGISTER_STYLES: Record<
  string,
  { bg: string; border: string; color: string; badge: string }
> = {
  failure: {
    bg: "rgba(255,61,113,0.08)",
    border: "rgba(255,61,113,0.2)",
    color: "#ff3d71",
    badge: "rgba(255,61,113,0.2)",
  },
  tension: {
    bg: "rgba(255,217,64,0.08)",
    border: "rgba(255,217,64,0.2)",
    color: "#ffd740",
    badge: "rgba(255,217,64,0.2)",
  },
  progress: {
    bg: "rgba(0,230,118,0.08)",
    border: "rgba(0,230,118,0.2)",
    color: "#00e676",
    badge: "rgba(0,230,118,0.2)",
  },
};

const AGENT_COLORS: Record<string, string> = {};
const AGENT_COLOR_LIST = ["#00e5ff", "#ff3d71", "#ffd740", "#00e676"];
let agentColorIdx = 0;

function getAgentColor(agentId: string): string {
  if (!AGENT_COLORS[agentId]) {
    AGENT_COLORS[agentId] = AGENT_COLOR_LIST[agentColorIdx % AGENT_COLOR_LIST.length];
    agentColorIdx++;
  }
  return AGENT_COLORS[agentId];
}

type HeistMomentCardProps = {
  card: CollapsedMomentCard;
  isActive: boolean;
  onClick: (seq: number) => void;
};

export function HeistMomentCardComponent({ card, isActive, onClick }: HeistMomentCardProps) {
  const styles = REGISTER_STYLES[card.register] ?? REGISTER_STYLES.tension;
  const agentColor = getAgentColor(card.agentId);

  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 hover:brightness-110"
      style={{
        background: isActive ? styles.bg : "transparent",
        borderColor: isActive ? styles.border : "rgba(255,255,255,0.04)",
      }}
      onClick={() => onClick(card.seq)}
    >
      <span className="mt-0.5 shrink-0 text-sm">{card.icon}</span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-[12px] font-semibold"
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              color: styles.color,
            }}
          >
            {card.title}
            {card.count > 1 && (
              <span className="ml-1 text-[10px] opacity-70">(\u00D7{card.count})</span>
            )}
          </span>
          <span
            className="rounded-sm px-1 py-px text-[8px] font-semibold uppercase tracking-wide"
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              background: styles.badge,
              color: styles.color,
            }}
          >
            {card.register}
          </span>
          <span
            className="ml-auto shrink-0 text-[10px]"
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              color: "#445",
            }}
          >
            T{card.turn}
          </span>
        </div>

        <span
          className="truncate text-[11px] text-[#556]"
          style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
        >
          {card.detail}
        </span>

        <span
          className="mt-0.5 inline-flex w-fit rounded-sm px-1.5 py-px text-[9px] font-semibold"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            background: `${agentColor}15`,
            color: agentColor,
          }}
        >
          {card.agentId}
        </span>
      </div>
    </button>
  );
}
