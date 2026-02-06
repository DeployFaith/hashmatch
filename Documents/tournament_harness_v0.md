# Tournament Harness v0

This document defines a minimal tournament harness that can run batches of Agent League matches **offline**, producing deterministic, portable artifacts.

The harness is intentionally infrastructure‑free: no servers, no DB.

## 1. Goals

* run tournaments (round‑robin or bracket)
* produce deterministic match outputs
* generate standings from match results
* output artifacts that can be replayed and verified
* support “fight card” metadata for spectator packaging

Non‑goal (for v0): online matchmaking, identity services, payments.

## 2. Inputs

### 2.1 Required

* scenario artifact (or reference to scenario package)
* list of agents (artifact references)
* mode profile id/name

### 2.2 Optional

* tournament metadata:

  * title
  * organizer
  * fight card ordering (prelims/main card/main event)
  * ruleset label

## 3. Determinism

The harness must be deterministic when the mode requires it.

Rules:

* the tournament must have a single **tournament seed**
* each match seed must be derived deterministically from:

  * tournament seed
  * matchKey (stable string)

### 3.1 Match Key

A matchKey must be stable across machines and runs.

Recommended format:

* `roundIndex:agentAId:agentBId` for round‑robin
* `bracketPath:agentAId:agentBId` for bracket

Important:

* agent ordering must be canonical (sort by stable id) unless the scenario explicitly models sides.

### 3.2 Seed Derivation

Use a hash‑based derivation:

* `matchSeed = H(tournamentSeed || matchKey)`

If sides matter:

* derive `seedA` and `seedB` deterministically from matchSeed + agentId.

The derived seed(s) must be written into `match_manifest.json`.

## 4. Output Structure

A tournament run produces a folder.

```text
tournament_run/
  tournament_manifest.json
  standings.json
  matches/
    <matchId>/
      match.jsonl
      match_manifest.json
      match_summary.json
      moments.json          (optional, derived)
      commentary.json       (optional, show)
      highlights.json       (optional, show)
```

Optionally, the CLI can emit a single-file **tournament bundle** via `--bundle-out <path>`. The bundle is a versioned JSON payload that embeds `tournament_manifest.json`, `standings.json`, each match summary, and the `match.jsonl` logs as strings so replay viewers can load a full tournament without relying on the File System Access API.

Notes:

* `match.jsonl` + `match_manifest.json` are the truth layer.
* `match_summary.json` and `moments.json` are telemetry.
* `commentary.json` and `highlights.json` are show.

## 5. Tournament Manifest (Draft)

`tournament_manifest.json` should include:

* `tournamentId`
* `title`
* `modeProfileId`
* `harnessVersion`
* `createdAt` (optional; store outside deterministic hashes if needed)

**Participants**

* list of agents with:

  * `agentId`
  * `owner` (optional)
  * `contentHash` (optional early)

**Scenario**

* scenario id/version
* scenario contentHash (optional early)

**Seed**

* `tournamentSeed`
* `seedDerivation` description

**Matches**

* list of match entries:

  * `matchId`
  * `matchKey`
  * `seed`
  * agent ids
  * output path
  * (optional) fight card slot metadata

## 6. Match Manifest (Harness Responsibilities)

The harness must write `match_manifest.json` per match.

Minimum recommended:

* `matchId`
* `modeProfileId`
* `scenario` id/version
* agent ids + versions
* derived match seed
* harness version

Optional but strongly recommended:

* `scenario.contentHash`
* `agent.contentHash`

## 7. Running a Match

For each match:

1. load scenario
2. load two agents
3. initialize RNG with derived seed
4. run until terminal condition (win/loss/timeout/maxTurns)
5. write `match.jsonl`
6. compute `match_summary.json`
7. (optional) compute `moments.json`

The harness should treat scenario/agent execution as a black box defined by the contract.

## 8. Standings & Scoring

Standings must be derived from match summaries.

### 8.1 Default Scoring

* win = 3
* draw = 1
* loss = 0

This scoring model intentionally discourages draws by rewarding wins disproportionately.

If a scenario supports points, also compute:

* pointsFor
* pointsAgainst

### 8.2 Standings Ranking

**Primary sort key:** standings points (descending). Points are the primary ranking criterion, NOT a tie-breaker.

**Tie-breakers** (applied only when two or more agents have equal standings points):

1. Head-to-head record
2. Total score differential (pointsFor − pointsAgainst)
3. Total points scored (`totalPointsScored` — the aggregate match score, i.e., pointsFor, NOT standings points)
4. Deterministic seed-derived coinflip (last resort, prevents ambiguity)

> **Terminology note:** "Total points scored" (`totalPointsScored`) refers to the aggregate match-level score (pointsFor across all matches), not standings points. This label exists to prevent confusion between the two meanings of "points."

The tie-break policy must be declared in the tournament manifest.

## 9. Fight Card Metadata (Spectator Packaging)

To support the “UFC for agents” vibe, the harness can optionally label matches with card slots.

Example:

* `card: prelims | main | main_event`
* `orderIndex`

This is metadata only; it does not affect match execution.

## 10. Verification Hooks

### 10.1 Hashing

The harness may compute hashes as part of output:

* `logHash` for `match.jsonl`
* `manifestHash` for `match_manifest.json`

These hashes may be stored in:

* `match_summary.json` (telemetry convenience)
* or a dedicated `hashes.json`

### 10.2 Receipts (Later)

In v0, signatures are optional. The harness should leave space for a future `receipt.json`.

## 11. Show‑Layer Hooks (Non‑Authoritative)

The harness MAY produce `moments.json` using the shared moment detection library (e.g., `src/lib/replay/detectMoments.ts`). This is optional. If produced, it is a telemetry-layer artifact.

The harness may also optionally produce show artifacts after the match completes:

* `highlights.json` (show)
* `commentary.json` (show)

Constraints:

* show artifacts must be labeled non‑authoritative
* show content must reference event ranges / moments
* show generation must not affect match execution

## 12. Minimal CLI Interface (Illustrative)

Examples (names TBD):

* `run-tournament --scenario <path> --agents <dir> --mode sanctioned --seed <seed>`
* `verify-tournament --path tournament_run/`

CLI shape is flexible; artifact outputs are the important contract.

## 13. v0 Success Criteria

* deterministic tournament runs
* stable file outputs
* replays loadable by viewer
* standings reproducible from match summaries
* ready for receipts and registry work later

## 14. Implementation Status (Repo Audit)

Last audited: 2026-02-06

The v0 harness is **implemented** in `src/tournament/runTournament.ts` with artifacts written by `src/tournament/artifacts.ts`.

### What is implemented

* Round-robin tournament with deterministic FNV-1a32 seed derivation.
* CLI at `src/cli/run-tournament.ts` with flags: `--seed`, `--rounds`, `--maxTurns`, `--scenario`, `--agents`, `--outDir`, `--bundle-out`.
* Output folder: `tournament_manifest.json`, `standings.json`, `matches/<matchKey>/match.jsonl`, `matches/<matchKey>/match_summary.json`.
* Single-file tournament bundle via `--bundle-out`.
* Standings with win=3 / draw=1 / loss=0 scoring, sorted by points (primary), then tie-break by scoreDiff → totalPointsScored → agentId.

### Differences from this spec

| Spec | Actual |
|---|---|
| Output named `tournament_manifest.json` | Transitioning: the harness dual-writes both `tournament.json` (legacy) and `tournament_manifest.json` (canonical) for one transitional release. `tournament.json` will be removed in the following release. |
| Per-match `match_manifest.json` | Not produced (only `match_summary.json`) |
| Default scoring: win=3, draw=1, loss=0 (§8.1) | Scoring: win=3, draw=1, loss=0 ✅ aligned |
| Bracket / single-elimination | Only round-robin |
| `verify-tournament` CLI | Not implemented |
| Fight card slot metadata (§9) | Not implemented |
| `moments.json` / `commentary.json` / `highlights.json` auto-generation (§11) | Not auto-generated by harness |
| Hashing hooks (§10) | Not implemented |
