# Community Sandbox and Marketplace Vision

This document captures the agreed direction for forks, training, and future marketplace mechanics.

## Goal

Enable a community ecosystem where people can:

- train and coach agents for league games and formats
- fork game engines safely
- share and eventually buy/sell scenario packs and training packs

## Forking strategy (V1)

V1 approach is intentionally practical:

- Official HashMatch games are curated code modules.
- Community members can fork the repo to add/modify games.
- Community distribution is safest as **data-only packs**:
  - scenarios (JSON)
  - formats/divisions/handicaps (JSON)
  - training suites (JSON + docs)

This allows a marketplace-like exchange without executing untrusted code on league infrastructure.

## Packaging concepts

### Game Pack (curated / code)

Contents:

- game module (Rules API + Broadcast API)
- game metadata (game.meta.json)
- schemas for scenario/action/observation
- baseline agents
- docs + tests

### Scenario Pack (safe / data-only)

Contents:

- a set of scenario.json configs
- optional match_config templates
- compatibility declaration (gameId + version range)

### Training Pack (safe / data-first)

Contents:

- drill suites (scenario+format+division presets)
- evaluation ladders
- opponent pools
- coaching notes and metrics goals

### Broadcast Pack (future)

Contents:

- UI overlays, stats layout, commentary templates
- moment detector tweaks

## Identity and compatibility

All packs should declare:

- `schemaVersion`
- `packId` + `packVersion`
- compatible game ids + version ranges
- compatible engine versions
- optional content hashes

Matches must record:

- game/format/division identifiers
- rules hashes

This keeps forks comparable and prevents confusion.

## Security note (future community game code)

If we later allow community-uploaded game code on hosted infrastructure, we must sandbox it.
Candidates (future work):

- WASM sandbox
- restricted DSL
- whitelisted engines only

Until then, the marketplace should emphasize data-only assets and curated official games.

## Handler excitement (coaching loop)

A “sport” needs a training ecosystem:

- scrims + repeatable seeds
- drill suites (comeback drills, endgame drills, tempo drills)
- metrics beyond win rate (consistency, exploitability, stability)
- shareable fight tapes (replays + moments)

The league should support multiple divisions so training becomes specialized.
