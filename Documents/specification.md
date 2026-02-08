# Specification

This document is the high-level system specification for HashMatch.

It is not an API reference. It defines the components, data flows, and the minimum contracts we need to build the harness + viewer + verification tooling.

## 0. Guiding Constraints

- Core loop works without servers/DB (current implementation is offline-first; product direction is evolving toward live-first — see `hashmatch_live_platform_direction_decision_architecture.md`)
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
- run `verify-receipt` to check signatures + hash consistency
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

## 13. Validation & Scoring Interfaces

### 13.1 ValidationReport Schema

A `ValidationReport` is the output of a post-match validation pass. It asserts whether a match's artifacts are structurally sound, internally consistent, and reproducible.

```typescript
interface ValidationReport {
  /** Unique identifier for this validation run */
  reportId: string;
  /** Match being validated */
  matchId: string;
  /** ISO 8601 timestamp of validation run (non-deterministic; not included in hashing) */
  validatedAt: string;
  /** Validator implementation version */
  validatorVersion: string;
  /** Overall result */
  result: "pass" | "fail" | "warn";
  /** Individual check outcomes */
  checks: ValidationCheck[];
}

interface ValidationCheck {
  /** Machine-readable check identifier (e.g., "log_hash_match", "seq_monotonic") */
  checkId: string;
  /** Human-readable description */
  label: string;
  /** Check outcome */
  result: "pass" | "fail" | "warn" | "skip";
  /** Explanation when result is not "pass" */
  detail?: string;
}
```

The `ValidationReport` is a telemetry-layer artifact. It does not alter truth artifacts and may be regenerated at any time from the truth layer.

### 13.2 WatchabilityScoreReport Schema (Optional)

> **Status:** This interface is defined for forward compatibility. It is optional until simulation infrastructure lands and automated watchability scoring is operational.

A `WatchabilityScoreReport` evaluates how engaging a match is for spectators, based on heuristics applied to the event log.

```typescript
interface WatchabilityScoreReport {
  /** Unique identifier for this report */
  reportId: string;
  /** Match being scored */
  matchId: string;
  /** Scorer implementation version */
  scorerVersion: string;
  /** Overall watchability score (0–100, integer) */
  overallScore: number;
  /** Breakdown by dimension */
  dimensions: WatchabilityDimension[];
  /** Signals that contributed to scoring */
  signals: WatchabilitySignal[];
}

interface WatchabilityDimension {
  /** Dimension name (e.g., "leadChanges", "momentDensity", "pacing") */
  name: string;
  /** Score for this dimension (0–100, integer) */
  score: number;
  /** Weight applied to this dimension in overall score */
  weight: number;
}

interface WatchabilitySignal {
  /** Signal type (e.g., "leadChange", "blunder", "comeback") */
  type: string;
  /** Event sequence index where the signal occurs */
  seq: number;
  /** Signal magnitude or relevance (0–1) */
  strength: number;
}
```

Watchability reports are telemetry-layer artifacts and are never required for verification.

## 14. Mode Profile Extensions

### 14.1 Spectator Delay (`spectatorDelayMs`)

Mode profiles may include a `spectatorDelayMs` field that controls when enhanced spectator information (telemetry overlays, moment annotations, enriched state summaries) is revealed relative to live event emission.

Semantics are defined in `mode_profiles.md` §4.3.

Cross-reference: the field is part of the mode profile schema and is read by the viewer to gate spectator-enhanced content.

### 14.2 Reserved Coaching Modes

The following coaching mode identifiers are reserved for future use. They define the degree of human involvement in an agent's decision-making during a match.

| Mode         | Semantics                                                                     |
| ------------ | ----------------------------------------------------------------------------- |
| `"advisory"` | Human can send suggestions; agent decides autonomously whether to follow them |
| `"approval"` | Agent proposes actions; human must approve before submission                  |
| `"copilot"`  | Human and agent collaborate on each action; both contribute to the decision   |
| `"piloted"`  | Human makes all decisions; agent is a passive executor                        |

Coaching mode is declared in the mode profile under `coaching.mode`. If omitted, the default is no coaching (fully autonomous agent).

**Constraints:**

- Sanctioned modes should restrict coaching to `"advisory"` or disallow it entirely.
- The coaching mode must be recorded in the match manifest under `config.coachingMode`.
- Matches with coaching enabled are not comparable to autonomous matches for ranking purposes unless the league rules explicitly allow it.

### 14.3 Coaching Transcript Logging

When coaching is enabled, all coaching messages must be logged in the event log as `CoachingMessage` events:

```typescript
interface CoachingMessageEvent {
  type: "CoachingMessage";
  seq: number;
  matchId: string;
  agentId: string;
  turn: number;
  /** Direction of the coaching message */
  direction: "coach_to_agent" | "agent_to_coach";
  /** Content of the coaching message (may be redacted in spectator view) */
  content: string;
}
```

Coaching messages are subject to the same visibility rules as observations: they may contain `_private` fields and are redacted in spectator mode per §5.4.

## 15. Non-Goals (For Now)

- live betting
- on-chain settlement

The following are future work that is now directionally planned (see `hashmatch_live_platform_direction_decision_architecture.md`):

- live platform features (matches watched via URLs in real time)
- real-time streaming infrastructure

These remain future layers on top of the current offline core loop.
