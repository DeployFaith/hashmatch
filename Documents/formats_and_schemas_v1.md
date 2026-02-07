# Formats and Schemas V1

This document defines the agreed file-format approach for representing Games, Scenarios, Formats, Divisions, and Handicaps in a forkable + marketplace-friendly way.

## Guiding rules
- **Rules live in code** (Game module).
- **Configurations live in JSON** (Scenario/Format/Division/Handicap).
- Every config is versioned (`schemaVersion`) and namespaced (`...Id`).
- All runtime-enforced constraints must be recorded in truth artifacts (match/tournament manifests).

## Game metadata

A Game ships a small metadata JSON file used for UI, identity, and packaging.

**File:** `game.meta.json`

Recommended fields:
- `schemaVersion`
- `gameId` (namespaced)
- `gameVersion` (semver)
- `name`, `shortName`
- `description`
- `tags` (e.g., strategy, bluffing, resource)
- `ui` (icon key, color hints)
- `rulesHash` (optional at author-time; required in manifests at runtime)
- `defaultScenarioId` (optional)

## Scenario (data-only)

A Scenario is a configured instance of a Game.

**File:** `scenario.json`

Required fields:
- `schemaVersion`
- `scenarioId` (namespaced)
- `gameId`
- `gameVersion`
- `params` (validated by the game)

Notes:
- `params` MUST be validated by the Game’s schema.
- Scenarios are safe to distribute and monetize as data packs.

## Match config

A Match config binds scenario + competitors + sport constraints.

**File:** `match_config.json`

Required fields:
- `schemaVersion`
- `scenarioRef` (scenarioId and/or embedded scenario)
- `seed`
- `agents` (agentId + role)
- `formatRef` (formatId)
- `divisionRef` (divisionId)
- optional `handicapRef` (handicapId) — only when explicitly allowed

Notes:
- Match manifests should capture the effective, computed constraints.

## Format (sport wrapper)

A Format defines match structure.

**File:** `format.json`

Typical fields:
- `schemaVersion`
- `formatId` (namespaced)
- `name`
- `matchType` (e.g., single, bestOf, rounds)
- `bestOf` / `rounds`
- `overtime` settings
- `timeControls` (turn deadline, etc.)

## Division (weight class)

A Division defines the “cage rules” that apply equally to all competitors.

**File:** `division.json`

Typical fields:
- `schemaVersion`
- `divisionId` (namespaced)
- `name`
- `constraints`:
  - compute budgets: `maxTokensPerTurn`, `maxOutputTokens`, `maxContextBytes`
  - pacing: `turnTimeMs`, `maxCallsPerTurn`
  - permissions: network/tools/filesystem
  - game limits: maxTurns, etc.

Division is the primary fairness mechanism (model-agnostic).

## Handicap / Boost (match modifier)

Handicaps/boosts are **explicit**, **declared**, and **auditable** modifiers that adjust constraints or friction without hiding model differences.

**File:** `handicap.json`

Typical fields:
- `schemaVersion`
- `handicapId` (namespaced)
- `name`
- `description`
- `delta` (applied on top of Division):
  - token/time deltas
  - context deltas
  - action friction multipliers (only if the game supports it)
- `allowedContexts`: ranked / exhibition / training

UI guidance:
- Avoid the word “handicap” in viewer UI; present as sanctioned rule tweaks (e.g., “Stamina Tax +10%”).

## Artifacts (truth vs telemetry)

Truth (must be verifiable):
- `match.jsonl`
- `match_manifest.json`
- `match_summary.json` (hashes)
- `tournament_manifest.json` (+ legacy alias `tournament.json`)

Telemetry (regenerable):
- `moments.json`

## Required manifest linkage

Match manifests should include:
- scenario/game refs: `gameId`, `gameVersion`, `scenarioId`
- sport refs: `formatId`, `divisionId`, optional `handicapId`
- effective computed budgets/permissions (not just references)

This prevents “secret nerfs” and supports verification across forks.

