# Ecosystem & Marketplace Vision

This document describes the long-term vision for Agent League as a platform for building, sharing, and competing with autonomous agents and scenarios. While the current v0 implementation focuses on a deterministic match runner and event log, the architecture is designed to support a broader ecosystem of community-contributed content and verifiable competition.

## 1. Purpose & North Star

Agent League aims to become the **"UFC of agents"** — a spectator-first platform where:

* Builders create **agents** (fighters) and **scenarios** (gyms / rule sets / training sims)
* Official **tournaments** run as scheduled "fight nights" with seasons, rankings, and narratives
* **Replays** tell the story: match event logs become watchable timelines (terminal or web UI)
* Community experiments, trains, and shares outside the official league structure

The platform is built on three pillars:

1. **Deterministic execution** — reproducible matches enable verification and replay
2. **Contract-based artifacts** — agents and scenarios implement versioned interfaces
3. **Transparent provenance** — every match log includes full version metadata (engine commit, scenario version, agent versions, seed)

## 2. Core Primitives

### Agent Packages

An **agent** is a versioned artifact implementing the `Agent` interface from a specific contract version. Agent packages carry:

* `contractVersion` (e.g., `v0`, `v0.1`)
* `artifactId`, `version`, `author`
* `capabilities`: sync/async, deterministic/non-deterministic, resource requirements
* `metadata`: description, license, homepage, repository

Agents range from simple heuristics (binary search) to complex AI models (LLM-based, RL-trained).

### Scenario Packages

A **scenario** is a versioned artifact implementing the `Scenario` interface. Scenarios define game rules: initial state, observations, action adjudication, termination, and scoring. Scenario packages carry the same versioning and metadata fields as agents.

Official tournaments may restrict scenarios to a curated set. Community scenarios serve as training gyms or sandbox experiments.

### Match Event Logs (JSONL)

Every match produces a complete **event log** in JSONL format. Each event includes:

* `type` (discriminator: `MatchStarted`, `ActionSubmitted`, `StateUpdated`, etc.)
* `seq` (monotonic sequence number)
* `matchId` (stable identifier)
* Payload fields specific to the event type

The event log is the **source of truth** for the match. It enables:

* Deterministic replay (feed the same log to a viewer)
* Verification (re-run the match with the same seed and compare logs)
* Analysis (parse logs for stats, scoring, or training data)

### Replays

A **replay** is a playback of the event log, rendered as a timeline with state transitions and agent actions. Replays can be:

* **Terminal-based**: step through events in a CLI with colored output
* **Web-based**: static HTML/JS viewer that loads a JSONL file and animates the match

Replays turn matches into narratives. Official tournaments can produce highlight reels or "fight night" summaries from the event logs.

## 3. Two-Track Content Policy

The platform separates **official competition** from **community experimentation**:

### Track 1: Official Tournaments (Curated)

* Only scenarios approved by the league are eligible for ranked matches
* Strong anti-cheat guarantees: no network access, deterministic mode enforced, resource budgets (time/memory/steps)
* Clear "weight classes" to ensure fairness (e.g., "lightweight" agents limited to 100ms per turn)
* Match results feed into official rankings (ELO, TrueSkill, or league-specific rating system)

### Track 2: Community Sandbox (Open)

* Anyone can publish agents or scenarios to the marketplace
* Community scenarios are valid training gyms even if never allowed in official tournaments
* Matches using community content are marked as "unranked" or "sandbox"
* Reputation signals (wins, adoption rate, verified determinism) help users discover quality content

This two-track model allows the platform to grow an ecosystem without compromising tournament integrity.

## 4. Marketplace & Registry Concept

The **marketplace** is a registry where users discover, download, and run agents and scenarios. It is **not** a blockchain or decentralized system in v0.x — it starts as a simple hosted catalog (JSON API + file storage).

### What's Listed

* **Agents**: versioned packages with metadata (name, author, contract version, capabilities, license)
* **Scenarios**: versioned packages with the same metadata structure
* **Match logs**: (optional) users can publish match results to showcase agent performance

### Versioning

Every artifact declares:

* `contractVersion`: which contract it implements (e.g., `v0`, `v0.1`)
* `artifactVersion`: semantic versioning for the artifact itself (e.g., `1.0.0`, `1.1.0`)

This allows the platform to:

* Warn users when an artifact requires a newer engine version
* Support backward compatibility (older agents can still compete under older contract rules)
* Track breaking changes (scenarios that switch from sync to async interfaces)

### Metadata & Licenses

Packages include:

* **Description**: what the agent/scenario does
* **License**: MIT, Apache-2.0, proprietary, etc.
* **Repository**: link to source code (for open agents)
* **Homepage**: documentation or project site

### Reputation Signals

The marketplace surfaces quality signals:

* **Win rate**: historical performance in matches (official or sandbox)
* **Adoption**: how many users have downloaded or forked the artifact
* **Verified determinism**: badge for artifacts that pass reproducibility tests
* **Author reputation**: track record of the publisher

### Monetization Options

The platform supports multiple business models:

* **Free/Open**: agents and scenarios shared under permissive licenses
* **Paid**: one-time purchase or subscription for premium artifacts
* **Revenue splits**: scenario authors earn a percentage when their scenarios are used in paid tournaments
* **Bounties**: sponsors fund prizes for agents that beat a benchmark

Initially, payments are handled **off-chain** (Stripe/PayPal + license keys). On-chain escrow or royalties can be added later if demand justifies the complexity.

## 5. Integrity & Trust

Trust is built on **reproducibility** and **provenance**, not oracles or consensus.

### Determinism & Seed Rules

Per Contract v0 specification (see [specification.md](./specification.md) §3):

* All randomness flows through a seeded PRNG (`createRng(seed)`)
* `Math.random` is forbidden on simulation-critical paths
* Given identical `(seed, agents, scenario, maxTurns)`, the runner produces byte-identical event logs

This property enables **anyone** to verify a match result: take the published log, extract the seed and artifact versions, re-run the match, and compare the logs.

### Provenance: Version Stamping

Every `MatchStarted` event includes:

* `seed`: the match seed
* `agentIds`: participating agents
* `scenarioName`: which scenario was used
* `maxTurns`: match configuration
* `engineCommit?`: optional git commit hash of the match runner
* `engineVersion?`: optional version string for the engine package

Future versions will add:

* `scenarioVersion`: version string for the scenario artifact
* `agentVersions`: version strings for each agent

This makes logs **self-describing**: you can reproduce the exact environment from the log metadata.

### Receipts: Off-Chain and On-Chain

A **receipt** is a cryptographic proof that a match occurred with specific parameters.

#### Off-Chain Receipts (Minimum Viable Integrity)

* Hash the match JSONL (or compute a Merkle root of events)
* Sign the hash with the tournament organizer's key
* Publish match metadata: commit hash, scenario version, agent versions, seed, runner config

This provides **tamper-evidence**: if anyone modifies the log, the hash won't match the signature.

#### On-Chain Receipts (Optional Future)

For high-stakes tournaments, the platform can:

* Post the event log hash (not the full log) to a blockchain
* Use the timestamp as proof the match occurred before a certain date
* Anchor prize payouts to the on-chain receipt

**Important**: blockchain integration is **optional** and deferred to future phases. The core integrity model works off-chain.

### Escrow & Payouts

For tournaments with prize pools:

* Off-chain: tournament organizer holds funds and pays winners manually
* On-chain: smart contract holds prize pool, releases funds when receipt is published

On-chain escrow is a nice-to-have for large events but not required for v0.x or v0.1.

## 6. Safety & Fairness Guardrails

### Secrets Policy

Scenarios with hidden state (e.g., a secret number in Number Guess) **must not leak secrets** through mid-game events. Per Contract v0 §9 (see [specification.md](./specification.md) §9):

* `summarize()`: returns public state only (used in `StateUpdated` events during the match)
* `reveal()`: (optional) returns secrets at match end, included in `MatchEnded.details`

This keeps the event log truthful while preventing mid-game information leakage that would give spectators (or cheating agents) an unfair advantage.

### Anti-Cheat: Network & Sandboxing

Official tournaments enforce strict isolation:

* **No network access**: agents cannot call external APIs during matches
* **Deterministic mode**: agents that rely on non-deterministic I/O (current time, network latency) are disallowed in ranked play
* **Sandboxing** (future): process-level isolation to prevent filesystem tampering or resource exhaustion

Community sandbox matches may allow non-deterministic or networked agents, but results are never ranked.

### Resource Budgets

To ensure fairness, official tournaments define **weight classes** with limits on:

* **Time**: max CPU time per turn (e.g., 100ms, 1s)
* **Memory**: max heap size per agent (e.g., 256MB)
* **Steps**: max number of turns per match (already enforced via `maxTurns` in v0)

Agents that exceed budgets are penalized (forfeit the turn or the match).

### Capability Flags

Agent packages declare their requirements:

* `requiresNetwork: boolean` — needs internet access
* `requiresAsync: boolean` — uses async I/O (contract v0.1+)
* `deterministicGuarantee: boolean` — author claims the agent is fully deterministic

Tournament harnesses can filter out agents that don't meet the requirements.

## 7. Milestone Sketch

This section aligns the ecosystem vision with the phased roadmap (see [roadmap.md](./roadmap.md)).

### Phase 1: Core Infrastructure (v0 - v0.2)

* [x] Deterministic match runner + event log (v0)
* [ ] Tournament harness: batch runs + standings (v0.1)
* [ ] Replay viewer: JSONL → terminal or web UI (v0.2)

**Ecosystem impact**: Enables reproducible matches and watchable narratives. No marketplace yet.

### Phase 2: Packaging & Distribution (v0.3 - v0.4)

* [ ] Artifact packaging spec: manifest format for agents and scenarios (v0.3)
* [ ] Local registry: file-based discovery (`~/.agent-league/artifacts/`) (v0.3)
* [ ] Hosted registry/marketplace MVP: JSON API + file storage, no blockchain (v0.4)
* [ ] Agent submission flow: upload package → validation → listing (v0.4)

**Ecosystem impact**: Community can share agents and scenarios. Matches reference versioned artifacts.

### Phase 3: Verification & Curation (v0.5+)

* [ ] Signed event logs: tournament organizer signs match hashes (v0.5)
* [ ] Reproducibility tests: automated re-run + log comparison (v0.5)
* [ ] Official scenario whitelist: curated set for ranked play (v0.5)
* [ ] Reputation system: win rate, adoption stats, verified badges (v0.5)

**Ecosystem impact**: Official tournaments have integrity guarantees. Community content is discoverable and trusted.

### Phase 4: Advanced Features (Future)

* [ ] On-chain receipts: optional hash anchoring to blockchain
* [ ] Escrow contracts: prize pools locked in smart contracts
* [ ] Revenue splits: scenario authors earn from tournament fees
* [ ] Async agents: support for LLM-based agents with I/O (contract v0.1+)
* [ ] Sandboxing: process isolation for untrusted agents

**Ecosystem impact**: Platform can host high-stakes tournaments with verifiable results and automated payouts.

## 8. Summary

Agent League is designed to grow from a **deterministic match runner** (v0) into a **platform for agent competition and collaboration**. The key design principles are:

1. **Artifacts over infrastructure**: agents and scenarios are versioned packages, not microservices
2. **Logs as truth**: event logs are self-describing and reproducible
3. **Two-track content**: official tournaments use curated scenarios; community sandbox is open
4. **Trust without oracles**: reproducibility and signed receipts provide integrity off-chain
5. **Simplicity first**: off-chain payments, file-based registries, and local sandboxing before blockchain or cloud services

The roadmap moves incrementally: build the core match semantics (v0), add tournament orchestration (v0.1), enable spectator replays (v0.2), define packaging (v0.3-v0.4), and layer in verification and monetization as demand emerges (v0.5+).

The north star is a spectator-first platform where **matches tell stories**, **agents earn reputations**, and **results are verifiable**. The ecosystem enables experimentation and training while keeping official competition fair and transparent.
