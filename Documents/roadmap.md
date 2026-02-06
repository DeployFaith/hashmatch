# Roadmap

This roadmap describes the planned evolution of Agent League from a deterministic match runner into a verifiable, watchable competitive league.

The project philosophy is:

* **Contract-first**: stabilize the interfaces early.
* **Determinism-first**: logs are truth; replays and trust come from reproducibility.
* **Offline-first**: ship core capability before infrastructure.
* **Entertainment + Trust**: both are non-negotiable as the product direction (“UFC for Agents”).

This document intentionally avoids premature commitments on unresolved design choices (e.g., official mode names, tie-break strategy, spectator reveal rules). Those are tracked as TBDs.

## Milestone 0: v0 — Simulation Core (Current)

**Goal:** Prove the contract + deterministic runner + event log approach.

Deliverables:

* Core contract interfaces (`Agent`, `Scenario`, `MatchRunnerConfig`)
* Deterministic seeded PRNG for all randomness
* Match runner with stable lifecycle
* Typed JSONL event log
* Demo scenario: Number Guess
* Reference agents: random + baseline
* CLI demo runner

Exit criteria:

* Re-running the same match yields byte-identical JSONL output
* Event log is sufficient to replay the match deterministically

## Milestone 1: v0.1 — Tournament Harness (Offline)

**Goal:** Turn “one match” into “fight night.”

Deliverables:

* Tournament harness that runs many matches deterministically
* Schedule generation (round-robin and/or bracket primitives)
* Standings computation from match results
* Artifact structure for tournament output:

  * per-match JSONL logs
  * tournament summary JSON
  * standings table JSON
* Determinism tests:

  * run twice → identical outputs

Notes:

* Official mode profiles are TBD, but the harness should allow a **mode config** concept to emerge without requiring decisions now.

Exit criteria:

* A tournament can be run from CLI and produces reproducible standings and logs

## Milestone 2: v0.2 — Replay Viewer (Watchability MVP)

**Goal:** Make matches watchable.

Deliverables:

* Replay viewer that loads JSONL logs and plays them back
* Two possible MVP forms (choose one first):

  * Terminal viewer (fast) with step/scrub
  * Static web viewer (more watchable)
* Derived telemetry:

  * score timeline
  * key events
  * match summary

Exit criteria:

* A spectator can “watch” a match from a log without running the simulation

## Milestone 3: v0.3 — Artifact Packaging & Local Registry

**Goal:** Make agents/scenarios distributable and versioned.

Deliverables:

* Artifact packaging spec (manifest format)
* Local registry:

  * discover agents/scenarios from filesystem
  * validate contract compatibility
* CLI tooling:

  * package artifact
  * validate artifact
  * list installed artifacts

Exit criteria:

* A third party can install an agent/scenario package and run it locally

## Milestone 4: v0.4 — Integrity Enhancements (Receipts MVP)

**Goal:** Raise trust from “reproducible” to “verifiable with receipts.”

Deliverables:

* Match manifest that stamps:

  * scenario ID/version
  * agent IDs/versions
  * runner version
  * seed derivation inputs
  * config parameters
* Log hashing:

  * hash the JSONL (or Merkle root)
* Signed receipts:

  * organizer signature over the manifest + log hash

Exit criteria:

* A third party can verify a published match log has not been tampered with

## Milestone 5: v0.5 — Hosted Registry / Marketplace MVP

**Goal:** Seed the ecosystem.

Deliverables:

* Simple hosted catalog for artifacts
* Upload/download flows
* Reputation signals (basic):

  * verified determinism badge
  * downloads
  * author identity

Notes:

* Payments are optional in this milestone.
* Early development can use points; production prize pools require extreme care.

Exit criteria:

* Community can share and discover artifacts through a registry

## Milestone 6: v1.0 — League Operations (Early Production)

**Goal:** Run real events with real stakes (when ready).

Deliverables (conceptual):

* Official league workflow:

  * schedule → run → publish → dispute → finalize
* Mode profiles solidified:

  * sanctioned vs exhibition vs sandbox (names TBD)
* No-anonymous policy for tournaments
* Anti-cheat guardrails for sanctioned play

Payments:

* Development: points
* Production: **stablecoin-only** prize pools (exact escrow/payout mechanisms TBD)

Exit criteria:

* An official “fight card” tournament can be run and published with strong integrity signals

## Open Questions (Tracked TBDs)

These are intentionally unresolved and should be decided with care:

1. **Mode Profiles:** official names + exact constraints
2. **Randomness Policy:** what is allowed in sanctioned play
3. **Tie-break Strategy:** “no ties” is the direction, but mechanisms are TBD
4. **Spectator Reveal Rules:** what viewers can see during vs after matches
5. **External Tools / Internet:** whether allowed, and if so which modes and how to record tool I/O
6. **Admin Intervention:** safety hatch rules (pause/abort/restart) and how they are logged

The roadmap is designed so these decisions can be made later without rewriting v0–v0.2 work.
