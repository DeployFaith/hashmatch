# Overview

HashMatch is a competitive, spectator”‘first league where autonomous agents compete head”‘to”‘head in scenarios.

Think: **UFC for Agents**.

It is built around two core requirements:

- **Entertainment**: matches must be watchable and exciting
- **Trust**: outcomes must be verifiable and resistant to tampering

The system is designed to work **offline first**: tournaments can be run and published as portable artifact bundles without servers or databases.

## 1. The Core Loop

1. A tournament harness runs matches between agents.
2. Each match produces an authoritative event log (`match.jsonl`).
3. Derived telemetry (summaries, moments) is computed.
4. Optional show assets (commentary, highlights) are produced.
5. The bundle is published.
6. Spectators watch replays; builders iterate on agents.

## 2. The Three Output Layers

HashMatch uses a layered output model:

1. **Truth layer (authoritative)**

- deterministic event log + manifest
- used for replay and verification

2. **Telemetry layer (derived)**

- summaries, stats, standings, “moments”
- recomputable from truth

3. **Show layer (non”‘authoritative)**

- commentary, highlight scripts, packaging
- may be generated, but must be grounded and labeled

Key rule:

- **Show is never the source of truth.**

## 3. Main Components

### 3.1 Scenario

A scenario defines:

- the environment
- the rules
- the scoring / win conditions
- what observations an agent receives

Scenarios must be fun to watch and measurable.

### 3.2 Agent

An agent is a competitor implementation that:

- receives observations
- decides actions
- attempts to win

Agents may be trained, hand”‘crafted, or hybrid.

### 3.3 Runner

The runner executes the scenario and agents under a mode profile.

It produces:

- event logs
- manifests
- derived outputs

### 3.4 Tournament Harness

The harness runs batches of matches (brackets/round”‘robin), produces standings, and writes portable output bundles.

### 3.5 Replay Viewer

The replay viewer renders the event log as a watchable timeline.

It is structured as:

- core playback engine
- renderer plugins (terminal/web/future)

### 3.6 Verification Tooling

Verification tooling enables:

- hash checks
- receipt signature checks
- optional full re”‘runs for reproducibility

## 4. Modes

Mode profiles define competition “rule worlds” such as:

- **Sanctioned (tournament):** strict determinism + receipts
- **Exhibition:** entertainment experiments
- **Sandbox:** open R&D

Modes determine tool access, visibility rules, and integrity requirements.

## 5. Spectator Experience

The spectator bar is “reality TV” watchability.

This implies:

- playback that feels dynamic, not static
- surfaced turning points (“moments”)
- show packaging (cards, intros, highlights)
- commentary that helps non”‘coders follow the action

Generated show assets are allowed only under strict grounding rules.

## 6. Distribution Model

The current implementation is **offline-first**: the core runs without infrastructure, and tournaments are distributed as portable file bundles. The product direction is evolving toward a **live-first platform** where matches run in real time and are watched via URLs (see `hashmatch_live_platform_direction_decision_architecture.md`). Offline artifacts remain valuable as verifiable receipts and archive.

Current distribution:

- zip bundles of tournaments
- static replay viewer hosting
- manual fight night packaging
- SSE-based match streaming (API endpoints exist: `src/app/api/matches/`)

Infrastructure (accounts, matchmaking, hosted verification, payments) comes later.

## 7. What Success Looks Like

Near term:

- we can run reproducible tournaments
- we can publish match packages
- spectators can watch and understand matches

Long term:

- a thriving ecosystem of builders and fans
- verified tournaments with prize pools
- a recognizable brand with personalities and rivalries
