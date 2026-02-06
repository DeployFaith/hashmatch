"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Event, EventType, Severity } from "@/lib/models";

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

export interface EventFilters {
  eventType: EventType | null;
  agentId: string | null;
  turn: number | null;
  severity: Severity | null;
  searchText: string;
}

const EMPTY_FILTERS: EventFilters = {
  eventType: null,
  agentId: null,
  turn: null,
  severity: null,
  searchText: "",
};

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

export function applyFilters(events: Event[], filters: EventFilters): Event[] {
  return events.filter((e) => {
    if (filters.eventType && e.type !== filters.eventType) {
      return false;
    }
    if (filters.agentId && e.relatedAgentId !== filters.agentId) {
      return false;
    }
    if (filters.severity && e.severity !== filters.severity) {
      return false;
    }
    if (filters.searchText) {
      const term = filters.searchText.toLowerCase();
      const inSummary = e.summary.toLowerCase().includes(term);
      const inDetails = e.details?.toLowerCase().includes(term) ?? false;
      if (!inSummary && !inDetails) {
        return false;
      }
    }
    return true;
  });
}

/** Filter episodes to only include matching event IDs. */
export function filterEpisodes(
  episodes: { id: string; title: string; startedAt: string; eventIds: string[] }[],
  filteredEventIds: Set<string>,
  turnFilter: number | null,
): { id: string; title: string; startedAt: string; eventIds: string[] }[] {
  return episodes
    .filter((ep) => {
      if (turnFilter !== null) {
        // Match turn by episode title "Turn N"
        const match = ep.title.match(/^Turn (\d+)$/);
        if (match && parseInt(match[1], 10) !== turnFilter) {
          return false;
        }
      }
      return true;
    })
    .map((ep) => ({
      ...ep,
      eventIds: ep.eventIds.filter((id) => filteredEventIds.has(id)),
    }))
    .filter((ep) => ep.eventIds.length > 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EventFilterBarProps {
  events: Event[];
  agentIds: string[];
  maxTurn: number;
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
}

export function EventFilterBar({
  events,
  agentIds,
  maxTurn,
  filters,
  onFiltersChange,
}: EventFilterBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  // Derive available event types from the data
  const eventTypes = useMemo(() => {
    const types = new Set(events.map((e) => e.type));
    return Array.from(types).sort();
  }, [events]);

  // Derive available severities from the data
  const severities = useMemo(() => {
    const sevs = new Set(events.map((e) => e.severity));
    return Array.from(sevs).sort();
  }, [events]);

  const hasActiveFilters =
    filters.eventType !== null ||
    filters.agentId !== null ||
    filters.turn !== null ||
    filters.severity !== null ||
    filters.searchText !== "";

  const update = useCallback(
    (partial: Partial<EventFilters>) => {
      onFiltersChange({ ...filters, ...partial });
    },
    [filters, onFiltersChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Event type filter */}
        <select
          value={filters.eventType || ""}
          onChange={(e) => update({ eventType: (e.target.value || null) as EventType | null })}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">All types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        {/* Agent filter */}
        {agentIds.length > 0 && (
          <select
            value={filters.agentId || ""}
            onChange={(e) => update({ agentId: e.target.value || null })}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">All agents</option>
            {agentIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}

        {/* Turn filter */}
        {maxTurn > 0 && (
          <select
            value={filters.turn ?? ""}
            onChange={(e) => update({ turn: e.target.value ? parseInt(e.target.value, 10) : null })}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">All turns</option>
            {Array.from({ length: maxTurn }, (_, i) => i + 1).map((t) => (
              <option key={t} value={t}>
                Turn {t}
              </option>
            ))}
          </select>
        )}

        {/* Severity filter */}
        <select
          value={filters.severity || ""}
          onChange={(e) => update({ severity: (e.target.value || null) as Severity | null })}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">All severities</option>
          {severities.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Search toggle */}
        <Button
          variant={searchOpen ? "default" : "outline"}
          size="sm"
          onClick={() => {
            if (searchOpen) {
              update({ searchText: "" });
            }
            setSearchOpen(!searchOpen);
          }}
          className="h-8"
        >
          <Search className="h-3 w-3" />
        </Button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            className="h-8 text-xs"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Search input */}
      {searchOpen && (
        <input
          type="text"
          value={filters.searchText}
          onChange={(e) => update({ searchText: e.target.value })}
          placeholder="Search events..."
          className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
      )}

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1">
          {filters.eventType && (
            <Badge variant="outline" className="text-xs">
              type: {filters.eventType.replace(/_/g, " ")}
            </Badge>
          )}
          {filters.agentId && (
            <Badge variant="outline" className="text-xs">
              agent: {filters.agentId}
            </Badge>
          )}
          {filters.turn !== null && (
            <Badge variant="outline" className="text-xs">
              turn: {filters.turn}
            </Badge>
          )}
          {filters.severity && (
            <Badge variant="outline" className="text-xs">
              severity: {filters.severity}
            </Badge>
          )}
          {filters.searchText && (
            <Badge variant="outline" className="text-xs">
              search: &quot;{filters.searchText}&quot;
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export { EMPTY_FILTERS };
