# Tournament Harness v0 (Offline)

This document specifies the **v0 tournament harness**: an offline tool that runs multiple matches deterministically and produces standings + artifacts.

The harness is the step from “one demo match” to a “fight night card.” It does not introduce servers, databases, networking, or any on-chain logic.

## 1. Goals

### Primary goals

1. **Batch orchestration:** run many matches across many agents/scenarios.
2. **Determinism:** identical inputs produce identical outputs (including standings).
3. **Artifacts:** produce a standard output layout for replays, summaries, and analysis.
4. **Extensibility:** allow future “mode profiles” (sanctioned/exhibition/sandbox) without requiring decisions now.

### Non-goals (v0)

* No hosted league operations (no accounts, submissions, payments).
* No sandboxing / process isolation (agents run in-process).
* No anti-cheat beyond determinism and logging.
* No spectator UI (though artifacts are designed for future viewers).

## 2. Inputs

The harness takes:

* `tournamentSeed: Seed` — seed for deterministic scheduling and match seeding
* `scenario: Scenario` — scenario instance (or scenario id if using registry later)
* `agents: Agent[]` — list of agents participating
* `format` — how matches are scheduled (round robin first)
* `matchConfig` — maxTurns and other runner config defaults

## 3. Deterministic Seeding

A tournament is deterministic if:

* the schedule is deterministic
* each match uses a deterministic derived seed

### Seed derivation

Define a pure function:

```
deriveMatchSeed(tournamentSeed, matchKey) -> Seed
```

Where `matchKey` is a stable string that uniquely identifies the match (e.g., `"RR:agentA-vs-agentB:game1"`).

Implementation notes:

* Use a stable hash (e.g., FNV-1a 32-bit) over `tournamentSeed + ":" + matchKey`.
* Avoid non-deterministic sources (time, randomness, filesystem order).

## 4. Scheduling Formats

### 4.1 Round Robin (v0)

Run every pair of agents exactly once (or twice, swapping “sides,” depending on scenario symmetry).

Determinism requirements:

* Sort agents by stable key (id) OR preserve input order, but choose one and keep it consistent.
* Enumerate all pairs in a stable order.

Output: a list of `MatchSpec` items.

### 4.2 Bracket Primitives (future)

A single-elimination bracket requires:

* seeding rules
* advancement rules
* tie-break rules

These are explicitly out of scope for v0 but the artifact model should not prevent them.

## 5. MatchSpec & MatchResult

### MatchSpec

```typescript
type MatchSpec = {
  matchKey: string;
  seed: Seed;
  scenarioName: string;
  agentIds: AgentId[];
  maxTurns: number;
  // future: modeProfileId, rulesetId, sideAssignments
};
```

### MatchResult

The harness consumes the runner’s `MatchResult`:

* matchId
* scores by agentId
* reason (completed / maxTurnsReached)
* output JSONL path (artifact)

## 6. Artifact Layout

A tournament run writes outputs to a directory:

```
out/
  tournament.json
  standings.json
  matches/
    <matchKey>/
      match.jsonl
      match_summary.json
```

### tournament.json

Includes:

* tournamentSeed
* scenarioName
* list of agents
* list of matches (specs)
* harness version

### standings.json

A derived table computed from match summaries. Contains:

* wins / losses
* points scored
* points conceded
* optional efficiency metrics (future)

### match_summary.json

Derived from the event log:

* matchId
* matchKey
* agentIds
* scores
* winner (if computed by harness policy)
* termination reason
* turns

**Note:** “Winner” may be derived by simple score comparison in v0. Future tournament policy may enforce “no ties” via best-of or tie-break rounds; that policy is TBD and should not be hard-coded into the v0 harness.

## 7. Standings Computation

Standings are a deterministic reduction over match summaries.

Suggested v0 scoring:

* Win: +1
* Loss: +0
* Tie: +0.5 (allowed only in harness v0 if scenario outputs equal scores)

**Product direction note:** The long-term stance is “no ties” for official tournaments, but the tie-break mechanism is intentionally TBD. The v0 harness may temporarily allow ties so the system can run end-to-end while tie-break policy is designed.

## 8. Mode Profiles (Placeholder)

The harness should accept an optional `modeProfile` object that may later control:

* randomness policy
* time/memory budgets
* tool/network access
* visibility rules (spectator reveal)
* dispute/receipt requirements

In v0, `modeProfile` may be a no-op, but reserving the concept prevents painful refactors later.

## 9. Determinism Tests

The harness must ship with a determinism test suite:

1. Run a tournament twice with identical inputs.
2. Ensure `tournament.json`, `standings.json`, and every `match.jsonl` are byte-identical.

If output paths contain timestamps, determinism is broken. Avoid timestamps.

## 10. CLI (v0)

A CLI entry point should:

* accept `--seed`, `--maxTurns`, `--scenario`, `--agents`
* run the tournament
* write outputs to `out/` (or a user-provided dir)
* print a concise summary

## 11. Future Extensions (Non-binding)

* Single-elimination brackets
* Best-of series
* Scenario-defined tie-break mini-rounds
* Signed receipts (hash + signature) over tournament artifacts
* Registry integration (load agents/scenarios from local or hosted catalog)
* Process isolation / sandboxing for untrusted agents
