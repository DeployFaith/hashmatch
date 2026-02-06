# Roadmap

This roadmap focuses on shipping a fun, verifiable core loop **without requiring servers or databases early**.

The goal is to reach a point where:

* we can run tournaments locally
* we can publish match packages as files
* spectators can watch replays that feel like a show
* builders can iterate and compete

Dates are intentionally omitted until milestones stabilize.

## Milestone 0 — Foundations (Done / In Progress)

**Outcome:** we have a coherent spec set and a minimal harness direction.

* contract spec for scenario + agent interaction
* tournament harness draft
* artifact packaging draft
* scenario design guidelines
* integrity direction (logs/receipts)

## Milestone 1 — Deterministic Tournament Harness (v0.1)

**Outcome:** run brackets and produce reproducible outputs.

Deliverables:

* CLI harness that:

  * runs N matches in a bracket/round‑robin
  * produces deterministic seeds per match
  * writes `match.jsonl` for each match
  * writes a standings table (derived)

Artifacts:

* `tournament_manifest.json` (draft)
* per match folder:

  * `match.jsonl`
  * `match_manifest.json` (draft)
  * `match_summary.json` (derived)

Verification gates:

* same inputs → same `match.jsonl` bytes
* no hidden dependence on wall‑clock or filesystem ordering

## Milestone 2 — Replay Viewer MVP (Watchability v0.2)

**Outcome:** spectators can “watch” a match as an unfolding timeline.

This milestone is not satisfied by “we can open a log.” The bar is:

* playback feels dynamic (play/pause/step/scrub)
* turning points can be surfaced
* the viewer is structured to support richer renderers later

Deliverables:

1. **Core playback engine**

* parses `match.jsonl`
* exposes a time/turn cursor
* computes baseline telemetry

2. **At least one renderer**

Choose one first:

* terminal renderer (fast) OR
* static web renderer (more watchable)

3. **Moment extraction (MVP)**

* produce `moments.json` from heuristics (score swings/errors/etc.)

4. **Commentary hooks (MVP)**

* support loading `commentary.json`
* basic rendering of commentary aligned to event ranges

Verification gates:

* viewer does not leak hidden info in live playback
* telemetry is recomputable from truth

## Milestone 2.1 — Show Experiments (Optional, v0.2.x)

**Outcome:** we can raise entertainment value without touching match correctness.

Deliverables:

* generate “show layer” artifacts from truth/telemetry:

  * highlight scripts (`highlights.json`)
  * commentary variants (`commentary.json`)
  * optional scene/storyboard prompts for visuals

Constraints:

* show artifacts must be labeled non‑authoritative
* all factual claims must reference truth ranges (event idx / moments)

This is a safe sandbox for the “reality TV” vibe.

## Milestone 3 — Artifact Bundles & Local Registry (v0.3)

**Outcome:** matches and tournaments can be distributed as portable bundles.

Deliverables:

* standardized folder layout (“broadcast package”)
* `broadcast_manifest.json` classifies files as truth/telemetry/show
* local registry index (simple file‑based catalog)
* tooling to validate bundle structure

Verification gates:

* bundle contains enough to replay and recompute telemetry
* bundle classification is correct (truth/telemetry/show)

## Milestone 4 — Receipts & Verification Tooling (v0.4)

**Outcome:** tampering is detectable and verification is practical.

Deliverables:

* hash computation (`logHash`, `manifestHash`, optional `truthBundleHash`)
* signed receipts for sanctioned matches
* verification CLI:

  * validates receipt signatures
  * recomputes hashes
  * optionally re‑runs match to confirm reproducibility

Verification gates:

* changing any truth artifact invalidates receipt
* verification is deterministic and produces clear error messages

## Milestone 5 — Tournament Operations (v0.5)

**Outcome:** “fight night” operations feel real.

Deliverables:

* match card metadata (prelims/main card/main event)
* intros/outros + recap generation (show layer)
* publish pipeline that outputs:

  * truth bundle + receipts
  * telemetry + standings
  * show assets

This milestone can still be file‑based.

## Milestone 6 — Online Infrastructure (Later)

Only after the offline loop is fun + trusted.

Potential components:

* hosted registry
* accounts and identity
* hosted verification + replay hosting
* tournament scheduling
* prize pool escrow/payouts (stablecoin)

Infrastructure must not be required to run a tournament.

## Cross‑Cutting Workstreams

### A) Scenario Library

* design scenarios that are:

  * fun to watch
  * measurable
  * hard to game
* add at least one hidden‑information scenario later

### B) Safety & Policy

* banned tool usage policies per mode
* logging and auditability
* dispute workflow

### C) Developer Experience

* templates for agent projects
* local harness quickstart
* reproducible builds

## Status Notes

* “No servers/DBs early” is a product constraint.
* “Watchability” is an explicit milestone requirement.
* Integrity is layered: truth first, then telemetry, then show.
