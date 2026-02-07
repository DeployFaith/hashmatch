# Game and Sport Model

This document captures the agreed model for how HashMatch represents **games**, **scenarios**, and **sport/esport packaging**.

## Definitions

### Game
A **Game** is the ruleset + broadcast contract that makes matches both:
- challenging for agents (skill expression), and
- entertaining for humans (watchability).

A Game is implemented as code (TypeScript/JS module) and exports two APIs:

1) **Rules API** (deterministic simulation)
- state initialization
- observation generation (including hidden-info redaction rules)
- action validation + safe fallbacks
- deterministic step/reducer
- terminal conditions
- scoring/outcome
- event emission (for match.jsonl)

2) **Broadcast API** (human-facing)
- interpretable summaries of state/events
- key metrics (score/advantage/resources/tempo)
- event highlighting hints
- optional game-specific moment detectors (in addition to generic heuristics)

### Scenario
A **Scenario** is a data-only configuration instance of a game.
- It selects a Game (`gameId`, `gameVersion`)
- It provides validated parameters (`params`) for that game
- It is portable, forkable, and marketplace-safe as a JSON file

### Sport Layer
The **Sport Layer** turns “a game match” into “an esport bout.”
It defines:
- match formats (BO1/BO3, rounds, overtime)
- divisions/weight classes (budgets + permissions)
- tournaments (Swiss, RR, double elim)
- integrity (manifests, hashes, verification)
- broadcast packaging (moments, overlays, stats)

## Layer separation (core decision)

- **Game = code** (Rules + Broadcast).
- **Scenario = JSON data** (game params).
- **Format + Division = JSON data** (sport packaging).
- **Artifacts = JSON/JSONL** (truth + telemetry).

We are explicitly avoiding “Game = pure JSON” in V1 to prevent accidentally building a programming language inside config files.

## Watchability principles
Games should naturally produce:
- swings (score/advantage reversals)
- brink moments (near-terminal states)
- punish windows (mistakes have consequences)
- meaningful interaction (opponent choices matter)

Broadcast must be able to show:
- what happened
- why it mattered
- how close it was

## Forking and identity
Every match must be attributable to immutable identifiers:
- `gameId` (namespaced)
- `gameVersion` (semver)
- `rulesHash` (hash of the game implementation bundle or canonical manifest)
- `scenarioId`
- `formatId`
- `divisionId`

These identifiers should appear in truth manifests so forks and community runs remain comparable and auditable.

## Artifact taxonomy
Truth (integrity-critical):
- `match.jsonl`
- `match_manifest.json`
- `match_summary.json` (includes hashes)
- `tournament_manifest.json` (+ legacy alias `tournament.json`)

Telemetry (nice-to-have, not truth-critical):
- `moments.json`
- replay UI computed moments (fallback)

Telemetry may be regenerated; truth must be verifiable.

## Roadmap anchor
The Scenario/Game Engine V1 should formalize:
- `GameRulesV1` interface
- `GameBroadcastV1` interface
- JSON schemas for Scenario, Format, Division, Handicap

