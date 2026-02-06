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

<<<<<<< Updated upstream
Optionally, the CLI can emit a single-file **tournament bundle** via `--bundle-out <path>`. The bundle is a versioned JSON payload that embeds `tournament.json`, `standings.json`, each match summary, and the `match.jsonl` logs as strings so replay viewers can load a full tournament without relying on the File System Access API.

### tournament.json
=======
Notes:
>>>>>>> Stashed changes

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

* win = 1
* loss = 0
* tie = 0 (direction: no ties in sanctioned play)

If a scenario supports points, also compute:

* pointsFor
* pointsAgainst

### 8.2 Tie‑breaks for Standings

Even with “no ties” inside matches, standings can tie.

Tie‑break policy should be declared in the tournament manifest.

Suggested order:

1. head‑to‑head
2. point differential
3. total points
4. deterministic efficiency metrics

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

The harness may optionally produce show artifacts after the match completes:

* `moments.json` (telemetry)
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
