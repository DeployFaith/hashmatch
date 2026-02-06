# Tournament Harness v0.1 Specification

## Purpose

Build a deterministic, offline tournament runner that can execute many matches, compute standings, and emit artifacts for replay and verification.

This is the first step toward “UFC of agents”: lots of fights, clean records, and watchable logs.

## Non-goals (v0.1)

- No servers, DBs, accounts, payments, or marketplace features.
- No blockchain requirements.
- No async/networked agents (keep sync-only unless the current contract already supports async).

## Inputs

- **Scenario**: a scenario factory/instance implementing the contract.
- **Agents**: list of agents (instances) with stable `id`.
- **Tournament config**:
  - `seed: number` — master seed for the tournament.
  - `maxTurns: number` — per-match limit.
  - `format`: round-robin (default) with optional repeats.
  - `repeats?: number` — number of times each pairing is run (default 1).
  - `pairing?: "roundRobin" | "singleElim"` (singleElim can be a stretch goal).

## Determinism Requirements

- Tournament run must be reproducible.
- All per-match seeds must be derived from the master seed + match identity.
- Given identical inputs (agents, scenario, tournament config), outputs are byte-identical.

## Seeding Model

- Derive a **match seed** as a function of:
  - tournament seed
  - scenario name/version string (if available)
  - ordered agent ids
  - match index (for repeats)

Example approach (conceptual):

- `matchKey = `${scenarioName}:${agentAId}:${agentBId}:${repeatIndex}``
- `matchSeed = deriveSeed(tournamentSeed, matchKey)`

If you don’t have a keyed hash util yet, implement a small deterministic string→u32 hash (e.g., FNV-1a) and feed that into your existing `createRng`/mulberry32.

## Tournament Formats

### Round Robin (v0.1 default)

- Every agent plays every other agent once per repeat.
- For N agents: matches = N*(N-1)/2 * repeats.
- Agent order within a match should be stable and deterministic (e.g., lexicographic by id).

### Seat-Order Fairness

To avoid first-move bias, seat order alternates deterministically by round: in even rounds (0, 2, …) the lower-index agent acts first, while in odd rounds (1, 3, …) the order is swapped. For single-round tournaments, seat order is also derived from match seed parity so that the lower-index agent does not always go first.

### Optional: Home/Away Variant

If scenarios are asymmetric, support playing both (A vs B) and (B vs A) as distinct matches. If not needed, skip.

## Outputs

### 1) Tournament Summary JSON

A single JSON file or stdout JSON containing:

- tournament metadata: seed, config, scenario, agent list
- match list with:
  - matchId
  - matchSeed
  - participants
  - score map
  - winner/loser/tie
  - path to log file (if writing)

- standings table

### 2) Match Logs (JSONL)

For each match, store the `runMatch` event log as JSONL.

- Folder layout suggestion:
  - `out/tournaments/<tournamentId>/matches/<matchId>.jsonl`

### 3) Standings

Compute per-agent:

- matches played
- wins / losses / ties
- total points (based on scenario score)
- optional: point differential, avg score, etc.

## Scoring and Ranking Rules

- Use scenario-provided `scores: Record<AgentId, number>` from `MatchEnded`.
- Define a deterministic ranking sort:
  1. wins
  2. total points
  3. head-to-head (optional)
  4. point differential
  5. stable tiebreaker: agentId

If scenario scores are not naturally win/loss, define win as highest score; tie if equal.

## CLI

Add a new CLI entry, e.g.:

- `npm run tournament -- --seed 123 --scenario numberGuess --agents random,baseline --repeats 10 --out out/`

CLI flags (suggested minimal):

- `--seed <number>`
- `--turns <number>`
- `--repeats <number>`
- `--out <dir>` (optional; default stdout-only)

## Code Structure

Suggested modules:

- `src/tournament/types.ts` — config + results types
- `src/tournament/seed.ts` — deriveSeed helpers
- `src/tournament/schedule.ts` — round-robin pairing generator
- `src/tournament/runTournament.ts` — orchestrator
- `src/cli/run-tournament.ts` — CLI wrapper

## Tests

- Determinism test:
  - Run tournament twice with same config → identical summary + identical match logs.

- Coverage test:
  - For N agents and repeats R, match count is expected.

- Seeding test:
  - Match seed derivation stable across runs.

## Deliverables for v0.1

- Round-robin tournament runner
- Deterministic seed derivation
- Per-match JSONL logs
- Tournament summary output + standings
- CLI command
- Tests for determinism and match count
