# DEV_NOTES — Agent League UI

## Overview

Frontend-only UI prototype for Agent League. Two primary personas:

1. **Spectator** — Timeline/event feed for watching matches unfold episode by episode.
2. **Systems Director** — Flow/rules inspector for examining states, triggers, invariants, and transitions.

No backend. All data is mock, validated by Zod, stored in-memory via Zustand.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + custom theme tokens |
| Components | shadcn/ui-style primitives (Radix UI + cva) |
| Icons | lucide-react |
| State | Zustand (single store) |
| Validation | Zod v4 (schemas for all models) |
| Tests | Vitest (existing engine tests preserved) |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout with AppShell
│   ├── page.tsx            # / — Arena dashboard
│   ├── globals.css         # Tailwind + theme tokens (dark/light)
│   ├── leaderboard/        # /leaderboard
│   ├── matches/            # /matches, /matches/[matchId]
│   ├── agents/             # /agents, /agents/[agentId]
│   ├── director/           # /director, /director/flows/[flowId]
│   └── settings/           # /settings — theme + reset demo data
├── components/
│   ├── ui/                 # Base primitives (button, card, badge, tabs, tooltip, separator)
│   ├── app-shell.tsx       # Layout: sidebar nav + content area
│   ├── status-card.tsx     # Metric cards for dashboard
│   ├── data-table.tsx      # Sortable/filterable table
│   ├── event-feed.tsx      # Chronological event list with severity
│   ├── timeline.tsx        # Episode-grouped vertical timeline
│   ├── state-machine-viewer.tsx  # States + transitions list view
│   ├── invariant-badge.tsx # PASS/FAIL/UNKNOWN with tooltip
│   ├── match-status-badge.tsx    # Status badge for matches
│   └── copy-json-button.tsx      # Copy model JSON to clipboard
├── lib/
│   ├── models/             # Zod schemas + TypeScript types
│   │   ├── agent.ts
│   │   ├── match.ts
│   │   ├── event.ts
│   │   ├── run.ts
│   │   ├── flow.ts
│   │   └── index.ts
│   ├── mock/               # Mock data (validated at import time)
│   │   ├── agents.ts       # 6 agents
│   │   ├── matches.ts      # 8 matches
│   │   ├── events.ts       # ~30 events for detailed match
│   │   ├── runs.ts         # Runs per match
│   │   ├── flows.ts        # 2 flows (Match Lifecycle, Agent Turn)
│   │   └── index.ts
│   ├── store.ts            # Zustand store (data + theme + selectors)
│   └── utils.ts            # cn() utility (clsx + tailwind-merge)
```

## State Management

Single Zustand store (`useAppStore`) holds:
- **Data arrays**: agents, matches, events, runs, flows (shallow-copied from mock)
- **Theme**: `"dark" | "light"` with `setTheme` and `toggleTheme`
- **Selectors**: `getAgent(id)`, `getMatch(id)`, `getEventsForMatch(matchId)`, etc.
- **Actions**: `resetData()` re-initializes all data from mock

No React context or providers needed. Zustand hooks work directly in client components.

## Theming

Dark/light theme implemented via CSS custom properties in `globals.css` using Tailwind v4's `@theme` directive. Theme is toggled by adding `data-theme="light"` to the root `<div>`. Colors follow a semantic naming convention: `--color-background`, `--color-primary`, `--color-muted`, etc.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build (Next.js) |
| `npm run lint` | ESLint (src + tests) |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Run Vitest tests |
| `npm run build:engine` | Build engine code (tsc, outputs to dist/) |

## Where to Extend

- **Add real data**: Replace mock imports in `src/lib/store.ts` with API calls or WebSocket feeds.
- **New scenarios**: Add Zod schemas in `models/`, mock data in `mock/`, and wire into the store.
- **New pages**: Add directories under `src/app/` following App Router conventions.
- **New components**: Add to `src/components/`. Use `ui/` for generic primitives, root for domain-specific.
- **Persistence**: Add `zustand/middleware` (e.g., `persist`) to the store for localStorage-backed state.
- **Search**: The nav has a placeholder position for search; add a command palette (cmdk) when needed.
