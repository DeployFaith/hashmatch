# DEV_NOTES — HashMatch UI

## Overview

Frontend-only UI prototype for HashMatch. Two primary personas:

1. **Spectator** — Timeline/event feed for watching matches unfold episode by episode.
2. **Systems Director** — Flow/rules inspector for examining states, triggers, invariants, and transitions.

No backend. All data is mock, validated by Zod, stored in-memory via Zustand.

## Tech Stack

| Layer      | Choice                                      |
| ---------- | ------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack)          |
| Language   | TypeScript (strict)                         |
| Styling    | Tailwind CSS v4 + custom theme tokens       |
| Components | shadcn/ui-style primitives (Radix UI + cva) |
| Icons      | lucide-react                                |
| State      | Zustand (single store)                      |
| Validation | Zod v4 (schemas for all models)             |
| Tests      | Vitest (existing engine tests preserved)    |

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
│   ├── replay/             # /replay — JSONL replay loader
│   └── settings/           # /settings — theme + reset demo data
├── components/
│   ├── ui/                 # Base primitives (button, card, badge, tabs, tooltip, separator)
│   ├── app-shell.tsx       # Layout: sidebar nav + content area
│   ├── status-card.tsx     # Metric cards for dashboard
│   ├── data-table.tsx      # Sortable/filterable table
│   ├── event-feed.tsx      # Chronological event list with severity
│   ├── event-filter-bar.tsx # Filter controls for timeline/events
│   ├── timeline.tsx        # Episode-grouped vertical timeline
│   ├── replay-loader.tsx   # Drag-drop file upload + sample fetch
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
│   ├── replay/             # Replay viewer logic
│   │   ├── parser.ts       # Zod schemas for engine events + JSONL parser
│   │   ├── parseJsonl.ts   # Raw JSONL line parsing with seq ordering
│   │   ├── adapter.ts      # Engine events → UI view model adapter
│   │   ├── event.ts        # Event normalization and schema
│   │   ├── redaction.ts    # Event redaction for visibility control
│   │   ├── detectMoments.ts # Moment detection (6 heuristic types)
│   │   ├── generateHighlights.ts # Highlight script generation
│   │   ├── commentary.ts   # Commentary file loading and querying
│   │   ├── bundle.ts       # Tournament bundle handling
│   │   ├── validateJsonl.ts # JSONL validation
│   │   ├── eventSource.ts  # Event streaming from file or network
│   │   ├── fixtures/       # Sample match data for testing
│   │   └── index.ts
│   ├── store.ts            # Zustand store (data + theme + selectors + replay)
│   └── utils.ts            # cn() utility (clsx + tailwind-merge)
```

## State Management

Single Zustand store (`useAppStore`) holds:

- **Data arrays**: agents, matches, events, runs, flows (shallow-copied from mock)
- **Replay metadata**: `replayMeta` — provenance info keyed by matchId
- **Theme**: `"dark" | "light"` with `setTheme` and `toggleTheme`
- **Selectors**: `getAgent(id)`, `getMatch(id)`, `getEventsForMatch(matchId)`, `isReplayMatch(id)`, etc.
- **Actions**: `resetData()`, `loadReplay(jsonl)`, `clearReplay(matchId)`

No React context or providers needed. Zustand hooks work directly in client components.

## Theming

Dark/light theme implemented via CSS custom properties in `globals.css` using Tailwind v4's `@theme` directive. Theme is toggled by adding `data-theme="light"` to the root `<div>`. Colors follow a semantic naming convention: `--color-background`, `--color-primary`, `--color-muted`, etc.

## Scripts

| Command                | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Start Next.js dev server                  |
| `npm run build`        | Production build (Next.js)                |
| `npm run lint`         | ESLint (src + tests)                      |
| `npm run typecheck`    | TypeScript type check                     |
| `npm test`             | Run Vitest tests                          |
| `npm run build:engine` | Build engine code (tsc, outputs to dist/) |

## Match outputs (local)

Run a local match and note the printed output paths:

```
scripts/match-local.sh --scenario numberGuess --seed 42 --turns 20 --agentA random --agentB baseline
```

Find the latest JSONL output quickly:

```
scripts/latest-match-jsonl.sh
```

Verify that actions exist in the JSONL:

```
rg '"ActionSubmitted"' "$(scripts/latest-match-jsonl.sh)"
```

## Replay Viewer

The replay viewer loads engine JSONL event logs and renders them as spectator-friendly timelines.

### How it works

1. **Entry point**: `/replay` page with file upload (drag & drop) or "Load sample replay" button
2. **Parsing**: `src/lib/replay/parser.ts` — Zod schemas validate each JSONL line against the engine event contract (`MatchStarted`, `TurnStarted`, `ObservationEmitted`, `ActionSubmitted`, `AgentRawOutput`, `ActionAdjudicated`, `InvalidAction`, `StateUpdated`, `AgentError`, `MatchEnded`)
3. **Adaptation**: `src/lib/replay/adapter.ts` — converts engine events to the UI view model (Match + Episodes + Events), groups by turn, generates human-readable summaries, derives severity tags
4. **Store integration**: `loadReplay(jsonl)` in the Zustand store parses, adapts, and injects the replay as a regular match + events into the store. Metadata (provenance) stored in `replayMeta`
5. **Rendering**: The match detail page (`/matches/[matchId]`) detects replay matches and shows:
   - Provenance bar (engine version, commit hash, seed) with copy buttons
   - Replay-specific metadata in the overview tab (scenario, seed, max/actual turns, end reason)
   - Agent cards derived from JSONL (no store lookup needed)
   - Runs tab shows "not available" message for replays

### Filtering

The Timeline tab includes an `EventFilterBar` component with controls for:

- Event type (dropdown)
- Agent ID (dropdown)
- Turn number (dropdown)
- Severity (dropdown)
- Text search (searches summary + details)

Filters apply to both the grouped Timeline view and the flat EventFeed below it.

### Sample replay

`public/replays/number-guess-demo.jsonl` contains a 5-turn Number Guess game between agents "alice" and "bob" (43 events), including an `AgentError` timeout event. It includes `engineVersion` and `engineCommit` provenance fields in the `MatchStarted` event.

### Key files

| File                                     | Purpose                                      |
| ---------------------------------------- | -------------------------------------------- |
| `src/lib/replay/parser.ts`               | Zod schemas for engine events + JSONL parser |
| `src/lib/replay/adapter.ts`              | Engine events → UI view model adapter        |
| `src/lib/replay/index.ts`                | Re-exports                                   |
| `src/components/replay-loader.tsx`       | File upload + sample fetch UI                |
| `src/components/event-filter-bar.tsx`    | Filter controls + filter logic               |
| `src/app/replay/page.tsx`                | Replay loading page                          |
| `public/replays/number-guess-demo.jsonl` | Sample replay file                           |

## Where to Extend

- **Add real data**: Replace mock imports in `src/lib/store.ts` with API calls or WebSocket feeds.
- **New scenarios**: Add Zod schemas in `models/`, mock data in `mock/`, and wire into the store.
- **New pages**: Add directories under `src/app/` following App Router conventions.
- **New components**: Add to `src/components/`. Use `ui/` for generic primitives, root for domain-specific.
- **Persistence**: Add `zustand/middleware` (e.g., `persist`) to the store for localStorage-backed state.
- **Search**: The nav has a placeholder position for search; add a command palette (cmdk) when needed.
- **Replay extensions**: Support additional provenance fields by extending `MatchStartedSchema` in `parser.ts`. Add new event types by extending the Zod union. Add localStorage caching by persisting `replayMeta` in Zustand middleware.
