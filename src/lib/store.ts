import { create } from "zustand";
import type { Agent, Match, Event, Run, Flow } from "@/lib/models";
import { mockAgents, mockMatches, mockEvents, mockRuns, mockFlows } from "@/lib/mock";
import { parseReplayJsonl, adaptReplayToViewModel } from "@/lib/replay";
import type { ReplayMeta } from "@/lib/replay";

interface AppState {
  // Data
  agents: Agent[];
  matches: Match[];
  events: Event[];
  runs: Run[];
  flows: Flow[];

  // Replay
  replayMeta: Record<string, ReplayMeta>;

  // Theme
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;

  // Selectors
  getAgent: (id: string) => Agent | undefined;
  getMatch: (id: string) => Match | undefined;
  getEvent: (id: string) => Event | undefined;
  getRun: (id: string) => Run | undefined;
  getFlow: (id: string) => Flow | undefined;
  getEventsForMatch: (matchId: string) => Event[];
  getRunsForMatch: (matchId: string) => Run[];
  getRunsForAgent: (agentId: string) => Run[];
  getMatchesForAgent: (agentId: string) => Match[];

  // Replay selectors
  getReplayMeta: (matchId: string) => ReplayMeta | undefined;
  isReplayMatch: (matchId: string) => boolean;

  // Actions
  resetData: () => void;
  loadReplay: (jsonl: string) => { matchId: string; errors: string[] };
  clearReplay: (matchId: string) => void;
}

const initialData = () => ({
  agents: [...mockAgents],
  matches: [...mockMatches],
  events: [...mockEvents],
  runs: [...mockRuns],
  flows: [...mockFlows],
  replayMeta: {} as Record<string, ReplayMeta>,
});

export const useAppStore = create<AppState>((set, get) => ({
  ...initialData(),
  theme: "dark",

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

  getAgent: (id) => get().agents.find((a) => a.id === id),
  getMatch: (id) => get().matches.find((m) => m.id === id),
  getEvent: (id) => get().events.find((e) => e.id === id),
  getRun: (id) => get().runs.find((r) => r.id === id),
  getFlow: (id) => get().flows.find((f) => f.id === id),

  getEventsForMatch: (matchId) => {
    const match = get().matches.find((m) => m.id === matchId);
    if (!match) {
      return [];
    }
    const eventIds = new Set(match.episodes.flatMap((ep) => ep.eventIds));
    return get().events.filter((e) => eventIds.has(e.id));
  },

  getRunsForMatch: (matchId) => get().runs.filter((r) => r.matchId === matchId),
  getRunsForAgent: (agentId) => get().runs.filter((r) => r.agentId === agentId),
  getMatchesForAgent: (agentId) => get().matches.filter((m) => m.agents.includes(agentId)),

  // Replay selectors
  getReplayMeta: (matchId) => get().replayMeta[matchId],
  isReplayMatch: (matchId) => matchId in get().replayMeta,

  resetData: () => set(initialData()),

  loadReplay: (jsonl) => {
    const { events: engineEvents, errors: parseErrors } = parseReplayJsonl(jsonl);

    if (engineEvents.length === 0) {
      return {
        matchId: "",
        errors:
          parseErrors.length > 0
            ? parseErrors.map((e) => `Line ${e.line}: ${e.message}`)
            : ["No valid events found in replay file"],
      };
    }

    const { match, events: uiEvents, meta } = adaptReplayToViewModel(engineEvents);

    // Remove previous version of this replay if re-loading
    const state = get();
    const filteredMatches = state.matches.filter((m) => m.id !== match.id);
    const existingReplayEventIds = new Set(
      state.events.filter((e) => e.id.startsWith(`replay-${match.id}-`)).map((e) => e.id),
    );
    const filteredEvents = state.events.filter((e) => !existingReplayEventIds.has(e.id));

    set({
      matches: [...filteredMatches, match],
      events: [...filteredEvents, ...uiEvents],
      replayMeta: { ...state.replayMeta, [match.id]: meta },
    });

    return {
      matchId: match.id,
      errors: parseErrors.map((e) => `Line ${e.line}: ${e.message}`),
    };
  },

  clearReplay: (matchId) => {
    const state = get();
    set({
      matches: state.matches.filter((m) => m.id !== matchId),
      events: state.events.filter((e) => !e.id.startsWith(`replay-${matchId}-`)),
      replayMeta: Object.fromEntries(
        Object.entries(state.replayMeta).filter(([id]) => id !== matchId),
      ),
    });
  },
}));
