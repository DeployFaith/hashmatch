# Project Overview

Agent League is a **contract-first simulation core** for running deterministic matches between autonomous agents. The system defines a small, stable contract (interfaces for agents, scenarios, and the match runner) and produces a complete event log (JSONL) as the source of truth for every match.

## Core Concepts

- **Contract v0** — A set of TypeScript interfaces (`Agent`, `Scenario`, `MatchRunnerConfig`) that define how agents and scenarios interact. Any agent or scenario that implements the contract can participate in a match.
- **Deterministic Execution** — All randomness flows through a seeded PRNG. Given the same seed and the same agents, a match produces _identical_ results every time.
- **Event Log** — Every meaningful state change during a match is captured as a typed event. The event log is JSON-serializable and can be replayed, analyzed, or streamed to a spectator UI later.
- **Scenario** — Defines the rules of a game: initial state, observations, action adjudication, termination, and scoring. Scenarios are pluggable — implement the `Scenario` interface and wire it into the runner.
- **Agent** — A participant that receives observations and returns actions. Agents range from simple heuristics (binary search) to AI models (future).

## Current State (v0)

- Contract interfaces defined in `src/contract/`.
- Deterministic seeded PRNG in `src/core/rng.ts`.
- Match runner in `src/engine/runMatch.ts`.
- One demo scenario: **Number Guess** (`src/scenarios/numberGuess/`).
- Two reference agents: random and baseline (binary search) in `src/agents/`.
- CLI tool (`src/cli/run-demo.ts`) for running demos and producing JSONL output.

## Non-goals

- **No infrastructure**: no servers, databases, containers, or cloud services.
- **No networking**: no HTTP APIs, WebSockets, or remote agent communication.
- **No external dependencies**: the simulation core is zero-dependency at runtime.
- **No spectator UI** (yet): the event log is designed to support future replay/playback, but no viewer exists in v0.
