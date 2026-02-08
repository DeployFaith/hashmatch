# HashMatch ”” Action Plan

**Date:** 2026-02-06
**Status:** Final (converged via adversarial review between Claude and ChatGPT)
**Scope:** From current state to trust-verified, multi-scenario league with watchable replays

---

## Preamble: Where We Are

> **Status update (2026-02-07):** Phases 0–3 are substantially complete. Three scenarios exist (NumberGuess, ResourceRivals, Heist). The Heist game framework is fully implemented with procedural generation, validation, and CLI. See per-phase status notes below.

The project has a working core loop: a deterministic tournament harness runs round-robin matches, writes structured output folders, and an interactive web replay viewer renders them with spoiler protection, redaction modes, and filtering. Three scenarios (NumberGuess, ResourceRivals, Heist) and multiple agents (random, baseline, noop, randomBidder, conservative, ollama) exist. Twenty-one design documents define the full system architecture.

What's remaining: signed receipts, bundle validation/local registry tooling, scene/storyboard prompts (show layer), tournament operations, and online infrastructure.

The plan below is ordered by dependency and strategic value. It begins with decisions that must be locked before any code ships, then sequences implementation work with explicit parallelism where safe.

---

## Phase 0: Decision Locks

**These are not code tasks. These are decisions to be written into the spec documents as canonical, single-source-of-truth rulings. They must land before any Phase 1 code.**

### Lock 1: Canonical Filenames

**Decision required:** One name for each manifest file. All docs and code must agree.

Recommended resolution:

| Artifact            | Canonical Name             | Notes                                                                                                                                           |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament manifest | `tournament_manifest.json` | Current code dual-writes `tournament_manifest.json` (canonical) and legacy `tournament.json` for one release, then deprecates `tournament.json` |
| Match manifest      | `match_manifest.json`      | Implemented ”” keep this name as canonical                                                                                                      |
| Match summary       | `match_summary.json`       | Already consistent ”” no change                                                                                                                 |
| Standings           | `standings.json`           | Already consistent ”” no change                                                                                                                 |

**Where to record:** `specification.md` §3”“4 as the canonical artifact names. Update `tournament_harness_v0.md`, `artifact_packaging.md`, `roadmap.md` to match.

### Lock 2: Scoring Model

**Decision required:** One scoring rule for standings, consistently applied everywhere.

Recommended resolution:

| Outcome | Points |
| ------- | ------ |
| Win     | 3      |
| Draw    | 1      |
| Loss    | 0      |

This is what the code already does. It rewards winning over drawing, which aligns with the "no ties" product direction.

**Tie-breakers for standings** (ordered):

1. Points
2. Head-to-head record
3. Total score differential (pointsFor − pointsAgainst)
4. Total points scored (`totalPointsScored`)
5. Deterministic seed-derived coinflip (last resort, prevents ambiguity)

**Where to record:** `tournament_rules.md` §8”“9 as the single source of truth. Update `tournament_harness_v0.md` §8.1 to match (remove the outdated scoring text). Verify the code's tie-break implementation matches this order.

### Lock 3: Hashing Rules

**Decision required:** Byte-level hashing contract so verification is cross-platform portable.

Recommended resolution:

**General rules:**

- Hash algorithm: SHA-256
- Hash input: raw bytes of the file as written to disk ”” never parsed/re-serialized
- Encoding: UTF-8, no BOM
- Hashes are represented as lowercase hex strings

**JSONL files (`match.jsonl`):**

- Every line ends with `\n` (LF, 0x0A)
- The file ends with a final `\n` (i.e., no content after the last newline)
- No trailing spaces on any line
- One JSON object per line, serialized by the stable serializer

**JSON manifest files (`match_manifest.json`, `tournament_manifest.json`):**

- Written by the project's stable JSON serializer (`src/core/json.ts`)
- Deterministic key ordering
- Hash the literal bytes as written
- File ends with a final `\n`

**Hash scope for manifests:**

- Define a `manifestCore` concept: the subset of manifest fields included in hash computation
- `createdAt` and other human-convenience timestamps are excluded from `manifestCore`
- `manifestHash` is computed over the canonical `manifestCore` bytes, not the full file
- The full file is still written with all fields for human readability

**Where to record:** New section in `integrity_and_verification.md` (§5 "Hashing Strategy" ”” expand with these byte-level rules). This section becomes the single reference for all hashing implementations.

### Lock 4: Moments Ownership

**Decision required:** Who produces `moments.json` and what happens when both harness and viewer can.

Recommended resolution:

- The moment detection logic lives in a shared library (`src/lib/replay/detectMoments.ts` or equivalent)
- The **viewer** always computes moments on-the-fly for immediate UX
- The **harness** may optionally write `moments.json` as a published telemetry artifact
- If `moments.json` exists in a bundle, the viewer loads and displays it as "published telemetry" instead of computing its own
- Both use the same library code, so results are identical

**Where to record:** `replay_and_broadcast.md` §4, `specification.md` §9.

---

## Phase 1: Trust Foundation

**Goal:** Every match produces verifiable provenance metadata. A third party can check that nothing was tampered with.

### 1.1 ”” `match_manifest.json` Production

**What:** The harness writes `match_manifest.json` alongside every `match.jsonl`.

**Fields (minimum required):**

```
matchId
modeProfileId (or "sandbox" default)
scenario.id
scenario.version
scenario.contractVersion
agents[] (for each):
  agent.id
  agent.version
config.maxTurns
config.seed
config.seedDerivationInputs (tournamentSeed + matchKey)
runner.name
runner.version
runner.gitCommit (optional)
createdAt (excluded from hash scope)
```

**Fields (recommended, can be placeholder initially):**

```
scenario.contentHash
agents[].contentHash
```

**Implementation notes:**

- Use the stable JSON serializer for deterministic output
- Terminate file with `\n`
- This is a truth-layer artifact

### 1.2 ”” `tournament_manifest.json` Production

**What:** Confirm `tournament_manifest.json` as canonical and dual-write legacy `tournament.json` for one transitional release.

**Fields:**

```
tournamentId
title (optional)
modeProfileId
harnessVersion
tournamentSeed
seedDerivation (description string)
scoringModel: { win: 3, draw: 1, loss: 0 }
tieBreakers: ["points", "headToHead", "scoreDifferential", "totalPointsScored", "seedCoinflip"]
scenario.id
scenario.version
participants[] (agentId, owner, version)
matches[] (matchId, matchKey, seed, agentIds, outputPath)
createdAt (excluded from hash scope)
```

**Compatibility:** For one release, write both `tournament.json` (old name) and `tournament_manifest.json` (new name) with identical content. Then deprecate `tournament.json`.

### 1.3 ”” SHA-256 Hashing

**What:** Compute and store hashes for truth artifacts.

**Hashes to compute per match:**

- `logHash`: SHA-256 of `match.jsonl` raw bytes
- `manifestHash`: SHA-256 of `match_manifest.json` manifestCore bytes

**Storage:** Add a `hashes` object to `match_summary.json`:

```json
{
  "hashes": {
    "logHash": "sha256:abcdef...",
    "manifestHash": "sha256:123456..."
  }
}
```

**Optional per-tournament:**

- `truthBundleHash`: SHA-256 over concatenated (sorted) per-match logHash values

### 1.4 ”” `verify-match` CLI

**What:** Minimal verification tool that recomputes hashes and checks them.

**Interface:**

```
verify-match --path matches/round0-agentA-agentB/
```

**Behavior:**

1. Read `match.jsonl` and `match_manifest.json`
2. Recompute `logHash` and `manifestHash`
3. Read stored hashes from `match_summary.json`
4. Compare
5. Output clear pass/fail with details on any mismatch

**Exit codes:** 0 = pass, 1 = fail, 2 = missing files

### 1.5 ”” `verify-tournament` CLI

**What:** Tournament-level verification that wraps per-match verification.

**Interface:**

```
verify-tournament --path tournament_run/
```

**Behavior:**

1. Validate tournament folder structure (required files present)
2. Run `verify-match` logic for every match
3. Recompute standings from match summaries using the declared scoring model
4. Compare recomputed standings to published `standings.json`
5. Output clear pass/fail with per-match and standings results

**Can run in parallel with Phase 2 (Scenario #2).**

---

## Phase 2: Scenario #2 (Parallel Track) — ✅ Done

> **Status (2026-02-07):** ResourceRivals is implemented as the hidden-information scenario (`src/scenarios/resourceRivals/`). It uses `_private` field-level redaction, exercises score swings, and is tested in `tests/resourceRivals.test.ts`. Additionally, the Heist scenario (`src/scenarios/heist/`) provides a third scenario with procedural generation.

**Goal:** A second scenario that exercises hidden information, score swings, and the redaction/reveal pipeline. This is both a content deliverable and a verification test vector.

**Start condition:** Can begin as soon as `match_manifest.json` production lands (Phase 1.1). Does not need to wait for hashing or verification CLI.

### 2.1 ”” Scenario Design

**Requirements:**

- Multi-turn strategic interaction (not guessing)
- Hidden information (private observations per agent)
- Score swings and reversals are structurally possible
- Clear "who is ahead" signal for spectators
- End-of-match reveal of hidden state
- Deterministic under seeded PRNG

**Suggested direction:** A resource-management or territory-control game where agents make allocation decisions with partial visibility of the opponent's state. The key is that spectators can follow the public state while private decisions create tension that resolves at reveal.

**Design checklist (from `scenario_design_guidelines.md`):**

- [ ] Observation model defined (public vs private fields)
- [ ] Action space defined
- [ ] Transition function deterministic under seed
- [ ] Scoring/win conditions clear and explainable
- [ ] Terminal conditions defined
- [ ] Telemetry extraction expectations documented
- [ ] "Interesting moment" signals identified
- [ ] Not trivially solved by one dominant strategy

### 2.2 ”” Implementation

- Implement scenario contract (same interface as NumberGuess)
- Implement at least 2 agents (random + one with basic strategy)
- Write scenario-specific event types (viewer handles unknowns gracefully already)
- Ensure private observations appear in `match.jsonl` with clear public/private field distinction

### 2.3 ”” Validation (This Is the Real Point)

Run the new scenario through the full pipeline and verify:

- [ ] `match_manifest.json` schema accommodates hidden-info fields
- [ ] Viewer redacts private observations in spectator mode
- [ ] Viewer reveals private observations in post-match/director mode
- [ ] Spoiler protection hides outcome until toggled
- [ ] Event filtering works with new event types
- [ ] Unknown event handling works for scenario-specific types
- [ ] End-of-match reveal (`Scenario.reveal()` → `MatchEnded.details`) includes hidden state
- [ ] Tournament round-robin works with the new scenario
- [ ] Hashes and verification work with the new scenario's output
- [ ] Moment detection finds something interesting (even if basic)

**If any of these fail, it means the manifest schema or verification rules need adjustment ”” which is exactly why this runs before those formats harden.**

---

## Phase 3: Watchability Upgrade — ✅ Done

> **Status (2026-02-07):** Moment detection with 6 heuristics is implemented (`src/lib/replay/detectMoments.ts`). `moments.json` and `highlights.json` are produced per match by the tournament harness. Viewer auto-play with speed control and keyboard shortcuts is implemented.

**Goal:** Matches feel like something you'd want to watch, not just inspect.

**Start condition:** After Phase 1.3 (hashing) lands and Scenario #2 is producing matches.

### 3.1 ”” Moment Detection Heuristics

**Upgrade `src/lib/replay/detectMoments.ts` to detect:**

| Moment Type       | Heuristic                                                  |
| ----------------- | ---------------------------------------------------------- |
| Score swing       | Score delta exceeds threshold within N turns               |
| Critical error    | `AgentError` event or invalid action at high-stakes turn   |
| Near-win reversal | Agent within X points of winning, then opponent closes gap |
| Last-turn win     | Match outcome decided on final turn                        |
| Blunder           | Invalid action that demonstrably costs points              |
| Comeback          | Agent recovers from >Y point deficit to win                |

**Implementation:** Same shared library, used by both viewer (on-the-fly) and harness (optional `moments.json` output).

### 3.2 ”” Harness `moments.json` Output

**What:** Optionally write `moments.json` as a telemetry artifact after each match.

**Fields per moment:**

```json
{
  "id": "moment-001",
  "label": "Score Swing",
  "type": "score_swing",
  "startSeq": 14,
  "endSeq": 18,
  "signals": { "scoreDelta": 15, "agent": "agentB" },
  "description": "Agent B closes a 15-point gap in 4 turns"
}
```

### 3.3 ”” Viewer Auto-Play (Optional)

Add timed playback (play/pause with configurable speed) to the web viewer. Currently it's step-by-step scrubbing only. This is a polish item but it meaningfully changes the "watching" experience.

---

## Phase 4: Packaging & Distribution

**Goal:** Bundles are self-describing, validated, and easy to share.

**Start condition:** After Phase 1 is complete and stable.

### 4.1 ”” `broadcast_manifest.json`

Implement the manifest defined in `artifact_packaging.md` §6.3:

```json
{
  "bundleId": "...",
  "bundleType": "match",
  "modeProfileId": "sandbox",
  "createdBy": "...",
  "files": [
    { "path": "match.jsonl", "class": "truth", "contentHash": "sha256:..." },
    { "path": "match_manifest.json", "class": "truth", "contentHash": "sha256:..." },
    { "path": "match_summary.json", "class": "telemetry" },
    { "path": "moments.json", "class": "telemetry" },
    { "path": "commentary.json", "class": "show" }
  ],
  "truthBundleHash": "sha256:..."
}
```

### 4.2 ”” Bundle Validation CLI

```
validate-bundle --path broadcast/
```

Checks: required files present, classification correct, hashes match if declared, no truth files missing.

### 4.3 ”” Doc Reconciliation Pass

Update all 12 documents to reflect:

- Canonical filenames (Lock 1)
- Scoring model (Lock 2)
- Hashing rules (Lock 3)
- Moments ownership (Lock 4)
- Actual implementation status

This should be a single, deliberate pass ”” not incremental drift fixes.

---

## Phase 5: Developer On-Ramp

**Goal:** External builders can create agents and scenarios.

### 5.1 ”” Agent Project Template

A minimal starter repo/directory with:

- Agent contract interface
- Example agent (copy of baselineAgent with comments)
- Local test harness invocation example
- README with "build your first agent" walkthrough

### 5.2 ”” Scenario Authoring Guide

A practical companion to `scenario_design_guidelines.md`:

- Step-by-step "create a scenario" tutorial
- NumberGuess as annotated example
- Scenario #2 as annotated example (once complete)
- Checklist from §11 of the guidelines, with concrete examples

### 5.3 ”” Local Quickstart

```
# Clone repo
# npm install
# Run a demo match
npx run-demo
# Run a tournament
npx run-tournament --scenario numberGuess --agents ./agents --seed 42
# View the replay
npm run dev → open /replay → load tournament folder
```

---

## Phase 6: Fight Night Operations (File-Based)

**Goal:** "UFC for Agents" presentation layer, still entirely offline.

- Match card metadata (prelims / main card / main event)
- Fight card JSON with ordering and labels
- Intro/outro generation hooks (show layer)
- Publish pipeline script that assembles truth + telemetry + show into a broadcast bundle
- Recap generation (show layer, from moments + match summaries)

---

## Phase 7: Online Infrastructure (Future)

Only after Phases 1”“5 are solid and the offline loop is fun and trusted.

- Hosted bundle registry
- Accounts and identity
- Hosted replay viewer
- Tournament scheduling
- Receipts with real signatures (organizer keys)
- Prize pool escrow (stablecoin, trust-first)

---

## Dependency Graph

```
Phase 0: Decision Locks (BLOCKING ”” nothing else starts until these are recorded)
    │
    ├── Phase 1.1: match_manifest.json
    │       │
    │       ├── Phase 1.2: tournament_manifest.json
    │       │
    │       ├── Phase 1.3: Hashing
    │       │       │
    │       │       ├── Phase 1.4: verify-match CLI
    │       │       │       │
    │       │       │       └── Phase 1.5: verify-tournament CLI ───
    │       │       │                                               │
    │       │       └── Phase 3: Watchability ───────────────────── │ ──→ Phase 4: Packaging
    │       │                                                       │
    │       └── Phase 2: Scenario #2 (PARALLEL) ───────────────────┘
    │
    Phase 4 ──→ Phase 5: Developer On-Ramp ──→ Phase 6: Fight Night ──→ Phase 7: Online
```

Key parallelism:

- **Scenario #2** starts as soon as match_manifest.json lands, runs parallel with verify-tournament
- **Watchability** starts as soon as hashing lands and Scenario #2 produces matches
- **Packaging** starts after Phase 1 is stable

---

## Success Criteria

At the end of this plan:

| Milestone         | "Done" Means                                                           | Status                                                                             |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Decision Locks    | All 4 locks recorded in spec docs, contradictions deleted              | ✅ Done                                                                            |
| Trust Foundation  | Every match has a manifest + hashes, verify CLI gives pass/fail        | ✅ Done                                                                            |
| Scenario #2       | Hidden-info scenario runs in tournaments, exercises redaction pipeline | ✅ Done (ResourceRivals + Heist)                                                   |
| Watchability      | Moments detect score swings/blunders/reversals, viewer can auto-play   | ✅ Done                                                                            |
| Packaging         | Broadcast bundles are self-describing, validated, and shareable        | 🟨 Partial (broadcast manifest done; local registry + bundle validation remaining) |
| Developer On-Ramp | A stranger can build an agent and run it locally from the README       | ✬ Not started                                                                      |
| Fight Night       | A tournament can be packaged and "presented" as an event               | ✬ Not started                                                                      |

---

## What This Plan Does NOT Cover (Intentionally Deferred)

- Bracket/single-elimination tournament formats (round-robin is sufficient for now)
- Signed receipts / organizer keys (hashes first, signatures later)
- Mode profile enforcement by the harness (designed but not blocking)
- Public anchoring / ledger integration (explicitly future)
- Economy / prize pools (trust must be solid first)
- Live streaming infrastructure (offline-first)
- Multiple commentary personas (show layer polish)
- Agent marketplace (ecosystem maturity item)

---

## First Action

Open the spec documents. Record the four decision locks. Delete the contradicting text. Commit. Then start coding Phase 1.1.
