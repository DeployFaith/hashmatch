"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { MatchEvent } from "@/contract/types";
import { selectHeistMomentCandidates } from "@/components/heist/hud/selectors";
import {
  collapseMomentCards,
  momentCandidateToCard,
  type CollapsedMomentCard,
} from "./momentTemplates";
import { HeistMomentCardComponent } from "./HeistMomentCard";

type HeistMomentsPanelProps = {
  events: MatchEvent[];
  currentSeq: number;
  onSeekToSeq: (seq: number) => void;
};

type FilterState = {
  agent: string | null;
  register: string | null;
  category: string | null;
};

function buildMomentCards(events: MatchEvent[]): CollapsedMomentCard[] {
  const candidates = selectHeistMomentCandidates(events);
  const rawCards = candidates
    .map((candidate) => momentCandidateToCard(candidate))
    .filter((card): card is NonNullable<typeof card> => Boolean(card));
  const collapsed = collapseMomentCards(rawCards);
  return collapsed.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return b.seq - a.seq;
  });
}

export function HeistMomentsPanel({ events, currentSeq, onSeekToSeq }: HeistMomentsPanelProps) {
  const cards = useMemo(() => buildMomentCards(events), [events]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FilterState>({
    agent: null,
    register: null,
    category: null,
  });

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (filter.agent && card.agentId !== filter.agent) {
        return false;
      }
      if (filter.register && card.register !== filter.register) {
        return false;
      }
      if (filter.category && card.category !== filter.category) {
        return false;
      }
      return true;
    });
  }, [cards, filter]);

  // Auto-scroll to current moment
  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    const activeCard = scrollRef.current.querySelector("[data-active='true']");
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentSeq]);

  const handleCardClick = useCallback(
    (seq: number) => {
      // Find the event index for this seq
      const eventIndex = events.findIndex((e) => e.seq === seq);
      if (eventIndex >= 0) {
        onSeekToSeq(eventIndex);
      }
    },
    [events, onSeekToSeq],
  );

  // Gather unique agents and categories for filters
  const agents = useMemo(() => [...new Set(cards.map((c) => c.agentId))], [cards]);
  const categories = useMemo(() => [...new Set(cards.map((c) => c.category))], [cards]);
  const registers = useMemo(() => [...new Set(cards.map((c) => c.register))], [cards]);

  return (
    <div
      className="absolute bottom-20 right-6 z-10 flex w-72 flex-col rounded-[10px] border border-white/[0.04]"
      style={{
        background: "rgba(10,14,20,0.85)",
        backdropFilter: "blur(8px)",
        maxHeight: "min(400px, 50vh)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2">
        <span
          className="text-[10px] tracking-[1.5px] text-[#445]"
          style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
        >
          MOMENTS ({filteredCards.length})
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1 border-b border-white/[0.04] px-3 py-1.5">
        {agents.length > 1 &&
          agents.map((agentId) => (
            <button
              key={agentId}
              type="button"
              className="cursor-pointer rounded border px-1.5 py-px text-[9px] transition-colors"
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                borderColor:
                  filter.agent === agentId ? "rgba(0,229,255,0.3)" : "rgba(255,255,255,0.06)",
                background: filter.agent === agentId ? "rgba(0,229,255,0.1)" : "transparent",
                color: filter.agent === agentId ? "#00e5ff" : "#445",
              }}
              onClick={() =>
                setFilter((f) => ({ ...f, agent: f.agent === agentId ? null : agentId }))
              }
            >
              {agentId}
            </button>
          ))}
        {registers.map((register) => (
          <button
            key={register}
            type="button"
            className="cursor-pointer rounded border px-1.5 py-px text-[9px] transition-colors"
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              borderColor:
                filter.register === register
                  ? "rgba(0,229,255,0.3)"
                  : "rgba(255,255,255,0.06)",
              background: filter.register === register ? "rgba(0,229,255,0.1)" : "transparent",
              color: filter.register === register ? "#00e5ff" : "#445",
            }}
            onClick={() =>
              setFilter((f) => ({ ...f, register: f.register === register ? null : register }))
            }
          >
            {register}
          </button>
        ))}
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className="cursor-pointer rounded border px-1.5 py-px text-[9px] transition-colors"
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              borderColor:
                filter.category === cat ? "rgba(0,229,255,0.3)" : "rgba(255,255,255,0.06)",
              background: filter.category === cat ? "rgba(0,229,255,0.1)" : "transparent",
              color: filter.category === cat ? "#00e5ff" : "#445",
            }}
            onClick={() => setFilter((f) => ({ ...f, category: f.category === cat ? null : cat }))}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div ref={scrollRef} className="flex flex-col gap-1 overflow-y-auto px-2 py-2">
        {filteredCards.length === 0 ? (
          <div
            className="py-4 text-center text-[11px] text-[#334]"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            No notable moments yet
          </div>
        ) : (
          filteredCards.map((card) => {
            const isActive = card.collapsedSeqs.includes(currentSeq);
            return (
              <div key={card.id} data-active={isActive}>
                <HeistMomentCardComponent
                  card={card}
                  isActive={isActive}
                  onClick={handleCardClick}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
