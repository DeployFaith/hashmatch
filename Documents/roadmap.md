# Roadmap

This roadmap focuses on shipping a fun, verifiable core loop **without requiring servers or databases early**.

The goal is to reach a point where:

- we can run tournaments locally
- we can publish match packages as files
- spectators can watch replays that feel like a show
- builders can iterate and compete

Dates are intentionally omitted until milestones stabilize.

## Milestone 0 â€” Foundations (Done / In Progress)

**Outcome:** we have a coherent spec set and a minimal harness direction.

- contract spec for scenario + agent interaction
- tournament harness draft
- artifact packaging draft
- scenario design guidelines
- integrity direction (logs/receipts)

## Milestone 1 â€” Deterministic Tournament Harness (v0.1)

**Outcome:** run brackets and produce reproducible outputs.

Deliverables:

- CLI harness that:
  - runs N matches in a bracket/roundâ€‘robin
  - produces deterministic seeds per match
  - writes `match.jsonl` for each match
  - writes a standings table (derived)

Artifacts:

- `tournament_manifest.json` (draft)
- per match folder:
  - `match.jsonl`
  - `match_manifest.json` (draft)
  - `match_summary.json` (derived)

Verification gates:

- same inputs â†’ same `match.jsonl` bytes
- no hidden dependence on wallâ€‘clock or filesystem ordering

## Milestone 2 â€” Replay Viewer MVP (Watchability v0.2)

**Outcome:** spectators can â€œwatchâ€ a match as an unfolding timeline.

This milestone is not satisfied by â€œwe can open a log.â€ The bar is:

- playback feels dynamic (play/pause/step/scrub)
- turning points can be surfaced
- the viewer is structured to support richer renderers later

Deliverables:

1. **Core playback engine**

- parses `match.jsonl`
- exposes a time/turn cursor
- computes baseline telemetry

2. **At least one renderer**

Choose one first:

- terminal renderer (fast) OR
- static web renderer (more watchable)

3. **Moment extraction (MVP)**

- produce `moments.json` from heuristics (score swings/errors/etc.)

4. **Commentary hooks (MVP)**

- support loading `commentary.json`
- basic rendering of commentary aligned to event ranges

Verification gates:

- viewer does not leak hidden info in live playback
- telemetry is recomputable from truth

## Milestone 2.1 â€” Show Experiments (Optional, v0.2.x)

**Outcome:** we can raise entertainment value without touching match correctness.

Deliverables:

- generate â€œshow layerâ€ artifacts from truth/telemetry:
  - highlight scripts (`highlights.json`)
  - commentary variants (`commentary.json`)
  - optional scene/storyboard prompts for visuals

Constraints:

- show artifacts must be labeled nonâ€‘authoritative
- all factual claims must reference truth ranges (event idx / moments)

This is a safe sandbox for the â€œreality TVâ€ vibe.

## Milestone 3 â€” Artifact Bundles & Local Registry (v0.3)

**Outcome:** matches and tournaments can be distributed as portable bundles.

Deliverables:

- standardized folder layout (â€œbroadcast packageâ€)
- `broadcast_manifest.json` classifies files as truth/telemetry/show
- local registry index (simple fileâ€‘based catalog)
- tooling to validate bundle structure

Verification gates:

- bundle contains enough to replay and recompute telemetry
- bundle classification is correct (truth/telemetry/show)

## Milestone 4 â€” Receipts & Verification Tooling (v0.4)

**Outcome:** tampering is detectable and verification is practical.

Deliverables:

- hash computation (`logHash`, `manifestHash`, optional `truthBundleHash`)
- signed receipts for sanctioned matches
- verification CLI:
  - validates receipt signatures
  - recomputes hashes
  - optionally reâ€‘runs match to confirm reproducibility

Verification gates:

- changing any truth artifact invalidates receipt
- verification is deterministic and produces clear error messages

## Milestone 5 â€” Tournament Operations (v0.5)

**Outcome:** â€œfight nightâ€ operations feel real.

Deliverables:

- match card metadata (prelims/main card/main event)
- intros/outros + recap generation (show layer)
- publish pipeline that outputs:
  - truth bundle + receipts
  - telemetry + standings
  - show assets

This milestone can still be fileâ€‘based.

## Milestone 6 â€” Online Infrastructure (Later)

Only after the offline loop is fun + trusted.

Potential components:

- hosted registry
- accounts and identity
- hosted verification + replay hosting
- tournament scheduling
- prize pool escrow/payouts (stablecoin)

Infrastructure must not be required to run a tournament.

## Crossâ€‘Cutting Workstreams

### A) Scenario Library

- design scenarios that are:
  - fun to watch
  - measurable
  - hard to game

- add at least one hiddenâ€‘information scenario later

### B) Safety & Policy

- banned tool usage policies per mode
- logging and auditability
- dispute workflow

### C) Developer Experience

- templates for agent projects
- local harness quickstart
- reproducible builds

## Current Status (Confirmed by Repo Audit)

Last audited: 2026-02-07

### Milestone 0 â€” Foundations: âœ… Done

All spec documents are written and checked in under `Documents/`.

### Milestone 1 â€” Deterministic Tournament Harness: ✅ Done

| Deliverable                        | Status | Evidence                                                                      |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------- |
| CLI harness (run matches)          | âœ…     | `src/cli/run-match.ts`, `src/cli/run-demo.ts`                                 |
| Round-robin tournament             | âœ…     | `src/tournament/runTournament.ts`                                             |
| Deterministic seed derivation      | âœ…     | `deriveMatchSeed()` via FNV-1a32, tested in `tests/jsonl-determinism.test.ts` |
| `match.jsonl` per match            | âœ…     | `src/tournament/artifacts.ts`                                                 |
| Standings table                    | âœ…     | `standings.json` written by `writeTournamentArtifacts()`                      |
| Tournament bundle (`--bundle-out`) | âœ…     | `src/tournament/artifacts.ts` â†’ `writeTournamentBundle()`                     |
| Seeded PRNG (Mulberry32)           | âœ…     | `src/core/rng.ts`                                                             |
| Stable JSON serialization          | âœ…     | `src/core/json.ts`                                                            |
| NumberGuess scenario               | âœ…     | `src/scenarios/numberGuess/index.ts`                                          |
| Two agents (random, baseline)      | âœ…     | `src/agents/randomAgent.ts`, `src/agents/baselineAgent.ts`                    |
| Secret reveal at match end         | âœ…     | `Scenario.reveal()` â†’ `MatchEnded.details`                                    |

**Gaps vs spec:**

- Output file: resolved â€” `tournament_manifest.json` is canonical and the harness dual-writes legacy `tournament.json` for one transitional release.
- Per-match `match_manifest.json`: resolved â€” produced by `writeTournamentArtifacts()` in `src/tournament/artifacts.ts`.
- Bracket/single-elimination formats are not implemented (round-robin only).
- Scoring: resolved â€” spec updated to match implementation (win=3 / draw=1 / loss=0).

### Milestone 2 â€” Replay Viewer MVP: ✅ Done

| Deliverable                                       | Status | Evidence                                          |
| ------------------------------------------------- | ------ | ------------------------------------------------- |
| JSONL parsing (Zod-validated + tolerant)          | âœ…     | `src/lib/replay/parser.ts`, `parseJsonl.ts`       |
| Terminal renderer (console + Markdown recap)      | âœ…     | `src/cli/replay-match.ts`                         |
| Web replay viewer (interactive timeline)          | âœ…     | `src/app/replay/page.tsx` (~1900 lines)           |
| Moment extraction (6 heuristic types)             | ✅     | `src/lib/replay/detectMoments.ts`                 |
| Commentary hooks (parser + viewer)                | âœ…     | `src/lib/replay/commentary.ts`                    |
| Redaction / spoiler protection                    | âœ…     | `src/lib/replay/redaction.ts`                     |
| Three viewer modes (spectator/postMatch/director) | âœ…     | Implemented in web viewer                         |
| Event filtering (turn/agent/type)                 | âœ…     | Implemented in web viewer                         |
| Unknown event handling                            | âœ…     | Orange "(unknown)" label, dashed border           |
| Tournament folder loading                         | âœ…     | File System Access API + webkitdirectory fallback |
| Sample replay loading                             | âœ…     | Bundled fixture + `public/replays/`               |
| Deterministic event ordering by `seq`             | âœ…     | Stable sort in `parseJsonl.ts`                    |

**Gaps vs spec:**

- ~~No auto-play/pause~~ â€” resolved: autoplay with play/pause, speed control (0.5xâ€“10x), and keyboard shortcuts (Space, Left/Right) implemented.
- ~~Moment detection is basic~~ â€” resolved: `detectMoments()` implements 6 heuristic types: score_swing, lead_change, comeback, blunder, clutch, close_call.
- ~~`moments.json` is not produced~~ â€” resolved: `writeTournamentArtifacts()` writes `moments.json` per match when moments are detected.

### Milestone 2.1 â€” Show Experiments: 🟨 Partial

- Commentary parsing and rendering: ✅ implemented.
- `highlights.json` generation: ✅ implemented.
- Scene/storyboard prompts: ✬ not started.

### Milestone 3 â€” Artifact Bundles & Local Registry: 🟨 Partial

- Tournament folder output with standard layout: âœ…
- Single-file tournament bundle: âœ… (`--bundle-out`)
- `broadcast_manifest.json`: ✅ implemented.
- Local registry index: ✬ not implemented.
- Bundle validation tooling: ✬ not implemented (JSONL validation exists for individual files).

### Milestone 4 â€” Receipts & Verification Tooling: 🟨 Partial

- SHA-256 hash computation: âœ… `src/core/hash.ts` (`sha256Hex`, `hashFile`, `hashManifestCore`)
- Per-match `logHash` and `manifestHash` in `match_summary.json`: âœ…
- Tournament-level `truthBundleHash`: âœ… written to `tournament_manifest.json`
- `verify-match` CLI: ✅ `src/cli/verify-match.ts`, tested in `tests/verify-match.test.ts`
- `verify-tournament` CLI: ✅ `src/cli/verify-tournament.ts`, tested in `tests/verify-tournament.test.ts`
- Signed receipts: ✬ not implemented.
- Receipt validation: ✬ not implemented.

### Milestone 5 â€” Tournament Operations: ✬ Not Started

- No fight card metadata, intros/outros, or publish pipeline in the engine.
- Shell scripts exist for manual publishing (`scripts/match-publish.sh`, `scripts/tournament-publish.sh`) but are not part of the engine.

### Milestone 6 â€” Online Infrastructure: ✬ Not Started

### Cross-Cutting Workstreams

- **Scenario Library:** NumberGuess and Resource Rivals (hidden-information bidding game with `_private` field-level redaction).
- **Safety & Policy:** Mode profiles are defined in docs but not enforced by the harness.
- **Developer Experience:** No agent templates or quickstart guide.

## Status Notes

- "No servers/DBs early" is a product constraint.
- "Watchability" is an explicit milestone requirement.
- Integrity is layered: truth first, then telemetry, then show.
