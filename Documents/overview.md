# Project Overview

Agent League is a **contract-first, deterministic simulation core** for running matches between autonomous agents. It defines a small, stable contract (interfaces for agents, scenarios, and the match runner) and produces a complete event log (JSONL) as the source of truth for every match.

## North Star

**“UFC for Agents.”**

Agent League aims to become a prime-time, esports-style competition where agents face off head-to-head in scenarios that test **intelligence, efficiency, and robustness**. The project has two non-negotiables:

* **Entertainment:** matches should be watchable, dramatic, and capable of supporting storylines, rivalries, and “fight night” energy.
* **Trust:** outcomes must be verifiable—spectators and competitors should be able to confirm matches were run fairly and weren’t tampered with.

## Core Concepts

* **Contract v0** — A set of TypeScript interfaces (`Agent`, `Scenario`, `MatchRunnerConfig`) that define how agents and scenarios interact. Any agent or scenario that implements the contract can participate in a match.
* **Deterministic Execution** — All randomness flows through a seeded PRNG. Given the same inputs (agents, scenario, config, seed), a match produces *identical* results every time.
* **Event Log (Truth Layer)** — Every meaningful action and state transition is captured as a typed event. The event log is JSON-serializable and can be replayed, analyzed, audited, or streamed later.
* **Scenario** — Defines the rules of a game: initial state, observations, action adjudication, termination, and scoring. Scenarios are pluggable — implement the `Scenario` interface and wire it into the runner.
* **Agent** — A participant that receives observations and returns actions. Agents range from simple heuristics (binary search) to model-backed systems (future).

## Output Layers (Admin vs Spectator)

Agent League treats match output as three layers derived from the same run:

1. **Truth Layer (immutable):** the raw event log and match metadata required to verify and replay.
2. **Telemetry Layer (derived):** computed stats, timelines, summaries, and standings derived from the truth layer.
3. **Show Layer (narrative):** commentary, highlights, “turning points,” and other entertainment packaging.

Admins primarily operate in the **Truth + Telemetry** layers (running matches/tournaments, validating artifacts, publishing results). Spectators primarily consume **Telemetry + Show** layers (watching replays, highlights, analysis), with optional “deep dive” views.

## Modes (Conceptual)

The long-term product will likely support distinct **mode profiles** (names and details TBD), such as:

* **Sanctioned / Tournament:** strongest integrity requirements (e.g., money on the line).
* **Exhibition:** entertainment-forward experiments and formats.
* **Sandbox:** open community experimentation.

Mode profiles will define constraints like randomness policy, visibility rules, allowed tools, and dispute/verification expectations.

## Current State (v0)

* Contract interfaces defined in `src/contract/`.
* Deterministic seeded PRNG in `src/core/rng.ts`.
* Match runner in `src/engine/runMatch.ts`.
* One demo scenario: **Number Guess** (`src/scenarios/numberGuess/`).
* Two reference agents: random and baseline (binary search) in `src/agents/`.
* CLI tool (`src/cli/run-demo.ts`) for running demos and producing JSONL output.

## Ecosystem & Marketplace (Vision)

Agent League is designed to grow beyond a match runner into a platform for building, sharing, and competing with agents and scenarios. The long-term vision includes:

* **Agent and scenario packages** — versioned artifacts implementing the contract, shared via a community registry
* **Replay narratives** — event logs become watchable timelines (terminal or web UI) to make matches spectator-friendly
* **Provenance and integrity** — match outputs include full version metadata (engine, scenario, agents, seed) to enable reproducibility and verification
* **Leagues and tournaments** — bracketed events, standings, seasons, and fight cards
* **Marketplace** — discover, download, and run community-contributed agents and scenarios; support for paid artifacts and tournament revenue splits

See **[ecosystem.md](./ecosystem.md)** for the full platform vision and phased rollout plan.

## Non-goals (v0)

* **No infrastructure**: no servers, databases, containers, or cloud services.
* **No networking**: no HTTP APIs, WebSockets, or remote agent communication.
* **No spectator UI (yet)**: the event log is designed to support future replay/playback, but no viewer exists in v0.
