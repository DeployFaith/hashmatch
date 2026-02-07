# Specification

This document is the high-level system specification for HashMatch.

It is not an API reference. It defines the components, data flows, and the minimum contracts we need to build the harness + viewer + verification tooling.

## 0. Guiding Constraints

- Offline first (no servers/DB required for core loop)
- Deterministic outputs for sanctioned modes
- Portable artifact bundles
- Spectator watchability is a requirement
- Trust must be defensible (logs + provenance + receipts)

## 1. System Components

### 1.1 Agent

An Agent is a competitor implementation.

Contractually, an agent:

- receives an observation
- returns an action

Agents must follow the contract version declared in their manifest.

### 1.2 Scenario

A Scenario defines:

- rules
- observation model (public vs private)
- action space
- transition function
- scoring/win conditions

Scenarios should also define:

- telemetry extraction hooks
- any tie-break mechanics (if applicable)

### 1.3 Runner

Runner executes:

- a scenario
- two agents
- a mode profile

Runner responsibilities:

- enforce the contract
- enforce mode constraints (budgets/tools/visibility)
- write the canonical event log
- write match manifest metadata

### 1.4 Tournament Harness

Harness responsibilities:

- select matchups
- derive deterministic seeds
- invoke runner for each match
- compute standings
- write tournament artifacts

### 1.5 Replay Viewer

Viewer responsibilities:

- parse truth artifacts (log + manifest)
- compute derived telemetry
- render timeline playback via renderer plugins
- enforce visibility redactions
- optionally load show assets (commentary/highlights)

### 1.6 Verification Tooling

Verifier responsibilities:

- compute hashes
- validate receipts
- optionally reproduce matches

## 2. Artifact Layers

All outputs are organized into layers:

1. **Truth layer**

- authoritative
- deterministic when mode requires

2. **Telemetry layer**

- derived
- recomputable from truth

3. **Show layer**

- non-authoritative
- used for entertainment
- must be grounded and labeled

## 3. Canonical Match Artifacts

Minimum match outputs:

- `match.jsonl` (truth)
- `match_manifest.json` (truth)

Recommended derived outputs:

- `match_summary.json` (telemetry)
- `moments.json` (telemetry)

Optional show outputs:

- `commentary.json`
- `highlights.json`
- `assets/*`

## 4. Canonical Tournament Artifacts

Minimum tournament outputs:

- `tournament_manifest.json`
- `standings.json`
- per-match folders (match artifacts)

Optional:

- tournament receipt
- fight card metadata

## 5. Event Log Contract (JSONL)

The event log is a sequence of JSON objects.

### 5.1 Required Event Fields

Every event in `match.jsonl` must include:

- `type` (string, PascalCase)
- `seq` (integer, monotonically increasing from 0)
- `matchId` (string)

Additional fields depend on event type; see §5.2.

> **Note:** The original draft used `event_idx` and `payload` as field names. The implemented contract uses `seq` as the sequence counter and places type-specific data as top-level fields (not nested under `payload`). No `timestamp` field is emitted (determinism requirement).

### 5.2 Event Types (Implemented)

| Type                 | Additional Fields                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `MatchStarted`       | `seed`, `agentIds`, `scenarioName`, `maxTurns`, optional `engineCommit`, `engineVersion` |
| `TurnStarted`        | `turn`                                                                                   |
| `ObservationEmitted` | `agentId`, `turn`, `observation`                                                         |
| `ActionSubmitted`    | `agentId`, `turn`, `action`                                                              |
| `ActionAdjudicated`  | `agentId`, `turn`, `valid`, `feedback`                                                   |
| `StateUpdated`       | `turn`, `summary`                                                                        |
| `AgentError`         | `agentId`, `turn`, `message`                                                             |
| `MatchEnded`         | `reason` (`"completed"` or `"maxTurnsReached"`), `scores`, `turns`, optional `details`   |

Scenarios may define additional event types. The viewer treats unrecognized types as "unknown" and renders them with a raw JSON fallback.

### 5.3 Private vs Public Fields

Events may include both public and private information.

The viewer must enforce visibility policy:

- redact private fields for spectators during live playback
- optionally reveal private fields post”‘match

### 5.4 `_private` Field-Level Redaction Convention

Scenarios with mixed public/private observations use the `_private` key convention for field-level redaction.

**What it is:**

Any JSON object within an event payload may include a key named `_private`. The value of `_private` is an object containing fields that must be hidden from spectators during live playback.

**Example `ObservationEmitted` payload:**

```json
{
  "observation": {
    "objectiveValue": 12,
    "capturedScore": 45,
    "objectivesRemaining": 7,
    "_private": {
      "remainingResources": 73
    }
  }
}
```

In spectator mode, the viewer strips `_private` and its contents:

```json
{
  "observation": {
    "objectiveValue": 12,
    "capturedScore": 45,
    "objectivesRemaining": 7
  }
}
```

**Where it applies:**

- `ObservationEmitted` payloads (primary use case)
- `_private` keys are stripped recursively at any depth, including inside arrays of objects

**Spectator mode behavior:**

- All `_private` keys are removed from `displayRaw`; the remaining public fields are shown
- `isRedacted` is `true` (indicates some data was stripped)
- `summary` says "[partially redacted]" instead of "[redacted]"
- `fullRaw` is `null` unless spoilers are revealed

**Post-match and director modes:**

- `_private` keys are preserved (full observation visible)

**Backward compatibility:**

- Observations that do not contain any `_private` key continue to be fully redacted in spectator mode (entire `observation` replaced with a placeholder)
- Existing scenarios (e.g., NumberGuess) are unaffected

## 6. Match Manifest Contract

The match manifest describes everything needed to reproduce/verify the match.

Minimum:

- ids/versions for runner/scenario/agents
- mode profile id
- derived seed
- config limits (maxTurns)

Recommended:

- content hashes for scenario/agent artifacts
- seed derivation inputs

## 7. Mode Profile Contract

Mode profiles determine:

- determinism requirements
- tool access
- resource budgets
- visibility rules
- verification requirements
- show policy (generated assets allowed, grounding rules)

Mode profiles must be explicit (avoid hidden defaults).

## 8. Telemetry Contract

Telemetry is derived from logs.

Recommended telemetry outputs:

- final outcome and score
- winner
- per-turn score timeline
- invalid actions/errors
- efficiency metrics (scenario-defined)

Telemetry files must include enough context to be recomputable (e.g., references to event idx ranges).

## 9. Moments Contract

A moment is a flagged interesting segment.

Recommended fields:

- `id`
- `label`
- `start_event_idx`
- `end_event_idx`
- `signals` (why flagged)

Moments should be computable deterministically from truth.

Moments may be computed by the viewer on-the-fly or loaded from a published `moments.json` file. If both are available, the published file takes precedence.

## 10. Show Asset Contracts

Show assets are non-authoritative but must be grounded.

### 10.1 Commentary

- entries should reference event idx / moment ids
- must be labeled as show content

### 10.2 Highlights

- list of segments to show
- references to moments/event idx

### 10.3 Generated Visuals

Allowed only under show policy.

Rules:

- must not invent facts
- must not leak private info
- must include grounding references

## 11. Packaging

Bundling conventions are defined in `artifact_packaging.md`.

Key requirement:

- truth artifacts are sufficient for verification
- telemetry is convenience
- show is optional

## 12. Verification

Verification conventions are defined in `integrity_and_verification.md`.

The system must support:

- hash checks
- receipt validation
- optional re-run reproduction

## 13. Non”‘Goals (For Now)

- online platform features
- live betting
- on-chain settlement
- real-time streaming infrastructure

All of these are future layers on top of the offline core loop.
