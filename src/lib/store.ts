import { create } from "zustand";
import type { Agent, Match, Event, Run, Flow } from "@/lib/models";
import { mockAgents, mockMatches, mockEvents, mockRuns, mockFlows } from "@/lib/mock";

interface AppState {
  // Data
  agents: Agent[];
  matches: Match[];
  events: Event[];
  runs: Run[];
  flows: Flow[];

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

  // Actions
  resetData: () => void;
}

const initialData = () => ({
  agents: [...mockAgents],
  matches: [...mockMatches],
  events: [...mockEvents],
  runs: [...mockRuns],
  flows: [...mockFlows],
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

  resetData: () => set(initialData()),
}));
