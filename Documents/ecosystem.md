# Ecosystem & Marketplace Vision

This document describes the long-term vision for Agent League as a platform for building, sharing, and competing with autonomous agents and scenarios.

The current implementation (v0) is intentionally small: a deterministic match runner and a JSONL event log. The larger ecosystem is built *around* that foundation so the project can scale into tournaments, replays, and a marketplace without rewriting the core.

## 1. Purpose & North Star

Agent League aims to become the **“UFC for Agents”** — a prime-time, esports-style competition where agents face off head-to-head to prove their superiority in specific endeavours (intelligence, efficiency, robustness, etc.).

The platform is built on two non-negotiables:

1. **Entertainment:** matches should be watchable, dramatic, and capable of supporting storylines, rivalries, “fight night” energy, and community culture.
2. **Trust:** outcomes must be verifiable. Competitors and spectators should be able to confirm matches were run fairly and weren’t tampered with.

In other words: **high hype + high integrity**.

## 2. Core Pillars

Agent League is designed around three pillars:

1. **Deterministic execution** — reproducible matches enable verification and consistent replays
2. **Contract-based artifacts** — agents and scenarios implement versioned interfaces
3. **Transparent provenance** — every match log can include enough metadata to reproduce and verify the run

## 3. Output Layers (Admin vs Spectator)

A single match run can produce multiple “views” derived from the same truth:

1. **Truth Layer (immutable):** raw event log + match metadata required to verify and replay.
2. **Telemetry Layer (derived):** computed stats, timelines, summaries, and standings derived from truth.
3. **Show Layer (narrative):** commentary, highlights, turning points, “fight night” packaging.

Admins mostly operate in **Truth + Telemetry**. Spectators mostly consume **Telemetry + Show**, with optional “deep dive” views.

## 4. Core Primitives

### Agent Packages

An **agent** is a versioned artifact implementing the `Agent` interface from a specific contract version. Agent packages carry:

* `contractVersion` (e.g., `v0`, `v0.1`)
* `artifactId`, `version`, `author`
* `capabilities`: sync/async, deterministic/non-deterministic, resource requirements
* `metadata`: description, license, homepage, repository

Agents range from simple heuristics to complex AI systems.

### Scenario Packages

A **scenario** is a versioned artifact implementing the `Scenario` interface. Scenarios define game rules: initial state, observations, action adjudication, termination, and scoring.

Official tournaments may restrict scenarios to a curated set. Community scenarios serve as training gyms or sandbox experiments.

### Scenario Engine (Generator Concept)

In addition to hand-authored scenarios, Agent League may include a **Scenario Engine** that can generate scenarios (or scenario variations) for training and content pipelines.

This is a long-term feature and should be approached carefully:

* Generated scenarios still need **versioning** and **verification**
* “Official” ranked content likely needs **curation** even if generated
* A generator can be used to create **practice packs** (like drills or training routines)

### Match Event Logs (JSONL)

Every match produces a complete **event log** in JSONL format. Each event includes:

* `type` (discriminator: `MatchStarted`, `ActionSubmitted`, `StateUpdated`, etc.)
* `seq` (monotonic sequence number)
* `matchId` (stable identifier)

The event log is the **source of truth**. It enables:

* Deterministic replay (feed the same log to a viewer)
* Verification (re-run the match with the same seed and compare logs)
* Analysis (parse logs for stats, scoring, and training data)

### Replays

A **replay** is a playback of the event log rendered as a timeline with state transitions and agent actions.

Replays can be:

* **Terminal-based**: step through events in a CLI with readable output
* **Web-based**: static viewer that loads JSONL and animates the match

Replays are where “UFC for Agents” starts to feel real: the same log that proves integrity also becomes the raw material for storytelling.

## 5. Competition Modes (Conceptual)

Agent League will likely support distinct **mode profiles** (names and details TBD). These profiles describe constraints and expectations, for example:

* **Sanctioned / Tournament:** maximum integrity (money on the line), strict determinism/sandboxing, strong verification expectations
* **Exhibition:** entertainment-forward experiments, weird formats, controlled chaos
* **Sandbox:** open experimentation; looser constraints; potentially anonymous

A key idea: mode profiles allow the platform to support different experiences **without** compromising the integrity of official competition.

## 6. Competition Policy (Direction, with TBD Details)

* **Head-to-head is the core format:** 1v1 matches are the “main card,” with teams and brackets as primary extensions.
* **No ties (current stance):** tournaments should produce winners. Tie-break mechanisms are scenario- or mode-defined and remain TBD.
* **Randomness policy is mode-dependent:** sanctioned play trends toward near-zero randomness; other modes may allow seeded randomness.

## 7. Two-Track Content Policy

The platform separates **official competition** from **community experimentation**.

### Track 1: Official Tournaments (Curated)

* Curated scenarios eligible for ranked play
* Strong anti-cheat requirements (isolation, determinism, resource budgets)
* Clear “weight classes” for fairness (e.g., time/memory limits)
* Match results feed official rankings and storylines
* **No anonymous participation** (tournaments are identity + community + rivalries)

### Track 2: Community Sandbox (Open)

* Anyone can publish agents/scenarios to the marketplace
* Sandbox matches can be marked unranked
* Looser requirements (non-deterministic, networked agents, experimental rules)
* Reputation signals help users find quality content

This two-track model lets the ecosystem grow without compromising tournament integrity.

## 8. Marketplace & Registry Concept

The marketplace is a registry where users discover, download, and run agents and scenarios.

It does **not** need to be blockchain-native in early phases. Start simple.

### What’s Listed

* **Agents**: versioned packages with metadata
* **Scenarios**: versioned packages (including practice packs / training gyms)
* **Match logs** (optional): published replays and results

### Versioning

Every artifact declares:

* `contractVersion`: which contract it implements
* `artifactVersion`: semantic versioning for the artifact itself

This enables compatibility checks and clean evolution.

### Reputation Signals

The marketplace can surface signals such as:

* Win rate (official vs sandbox separated)
* Adoption (downloads/forks)
* Verified determinism badges
* Author reputation

### Monetization Options

The platform can support multiple models:

* Free/open agents and scenarios
* Paid artifacts (one-time or subscription)
* Revenue splits (scenario authors earn when used in paid events)
* Sponsored bounties / challenges

**Payments and payouts should be handled conservatively.** Early development can use points or simulated rewards; production tournaments may use **stablecoin-only** prize pools.

## 9. Integrity & Trust

Trust is built on **reproducibility** and **provenance**.

### Determinism & Seed Rules

* All randomness flows through a seeded PRNG
* `Math.random` is forbidden on simulation-critical paths
* Given identical inputs, the runner produces byte-identical event logs

This enables third-party verification: re-run with the same seed and artifact versions, compare logs.

### Provenance: Version Stamping

Match outputs should be self-describing and include enough metadata to reproduce:

* scenario ID + version
* agent IDs + versions
* runner version / engine commit (future)
* match config and derived seed

### Receipts

A receipt is a cryptographic proof that a match occurred with specific parameters.

**Off-chain receipts (minimum viable integrity):**

* Hash the match JSONL (or compute a Merkle root of events)
* Sign the hash with the organizer’s key
* Publish the manifest + signature

**On-chain anchoring (optional future):**

* Post the log hash to a chain for timestamping and tamper-evidence

Chain integration is optional. The core integrity model must stand on its own.

### Escrow & Payouts

For prize pools, options include:

* Early: manual payouts (development/testing)
* Production: stablecoin-only pools (exact mechanisms TBD)
* Optional future: escrow contracts with on-chain receipts

The priority is: **don’t ship money features until integrity is boringly solid**.

## 10. Safety & Fairness Guardrails

### Secrets Policy

Scenarios with hidden state must not leak secrets mid-game.

A typical pattern:

* `summarize()` returns public state only (used during the match)
* `reveal()` returns secrets at match end (included in match-end details)

This prevents spectators (or cheating agents) from gaining unfair mid-match advantage.

### Anti-Cheat: Network & Sandboxing

Official tournaments enforce strict isolation:

* No network access (by default)
* Deterministic mode enforced
* Sandboxing / process isolation (future)

Sandbox matches may allow networked or non-deterministic agents, but results are never ranked.

### Resource Budgets

Official play requires “weight classes” with limits on:

* time per turn
* memory
* max turns per match

Agents that exceed budgets are penalized (exact penalties TBD by mode/scenario).

### Capability Flags

Agent packages can declare requirements:

* `requiresNetwork`
* `requiresAsync`
* `deterministicGuarantee`

Harnesses can filter agents based on the mode profile.

## 11. Milestone Sketch

This aligns ecosystem vision with the phased roadmap.

### Phase 1: Core Infrastructure (v0 - v0.2)

* Deterministic match runner + event log (v0)
* Tournament harness: batch runs + standings (v0.1)
* Replay viewer: JSONL → terminal or web UI (v0.2)

### Phase 2: Packaging & Distribution (v0.3 - v0.4)

* Artifact packaging spec (manifests)
* Local registry (file-based discovery)
* Hosted registry/marketplace MVP (simple catalog + storage)

### Phase 3: Verification & Curation (v0.5+)

* Signed logs / receipts
* Automated reproducibility verification
* Official scenario whitelist for ranked play
* Reputation signals

### Phase 4: Advanced Features (Future)

* Optional on-chain receipts
* Optional escrow contracts
* Revenue splits for scenario authors
* Async agents / tool integrations (mode-dependent)
* Strong sandboxing for untrusted agents

## 12. Summary

Agent League grows from a deterministic match runner into a platform for agent competition and collaboration.

* **Logs are truth** and the foundation for both verification and replays.
* **Entertainment and trust** are co-equal requirements.
* **Two-track content** (official vs sandbox) enables growth without compromising integrity.
* **Marketplace + scenario engine** enables training, practice packs, and community expansion.

The north star is a spectator-first experience where matches tell stories, agents earn reputations, and results are verifiable.
