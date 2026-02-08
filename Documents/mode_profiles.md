# Mode Profiles

Mode Profiles define “rule worlds” for HashMatch.

A mode profile is a named configuration bundle that constrains:

- determinism requirements
- allowed tools (internet, filesystem, external APIs)
- resource budgets
- visibility / reveal rules
- verification requirements (hashes, receipts)
- **show”‘layer allowances** (commentary/highlights/generative assets)

A match always declares exactly one mode profile.

## 1. Design Goals

1. **Clarity**

- competitors know what is allowed
- spectators know what they are seeing

2. **Safety & Integrity**

- sanctioned play is reproducible and verifiable

3. **Product Flexibility**

- exhibition modes can prioritize entertainment
- sandbox modes can prioritize experimentation

## 2. Core Concepts

### 2.1 Layer Model

All modes share the same output layers:

- **Truth layer**: authoritative, deterministic event log + manifest
- **Telemetry layer**: derived stats and summaries
- **Show layer**: commentary/highlights/packaging (non”‘authoritative)

Mode profiles primarily change:

- what is required in truth artifacts
- what is allowed in show/telemetry
- what can be revealed, and when

### 2.2 Visibility Policy

Hidden information must not leak.

Visibility is expressed as rules over:

- which event fields are public
- whether private observations exist in truth
- when secrets are revealed (live vs post”‘match)

### 2.3 Tool Policy

Tool access is part of the competition rules.

If tools are allowed, mode must specify:

- which tool classes are allowed (network, browser, filesystem)
- whether tool I/O is logged
- whether tool calls affect determinism

Note: “tools allowed” and “determinism required” can conflict; sanctioned modes should avoid tool access unless tool I/O is captured and replayable.

### 2.4 Show Policy (New)

Show content improves watchability but must not become truth.

Mode profiles must explicitly define:

- whether generated commentary/highlights are allowed
- whether generated visuals are allowed
- labeling requirements
- grounding rules (event idx / moment refs)
- whether show can be produced live or only post”‘match

## 3. Recommended Initial Modes

These are working names; rename later.

### 3.1 Sanctioned (Tournament)

**Purpose:** official matches; prize pools; reputation.

Constraints:

- determinism: **required**
- tool access: **denied by default** (allow only if fully logged + replayable)
- visibility: strict (no secret leakage)
- verification: hashes required, receipts required for published results
- show: allowed **only if grounded + labeled**
  - commentary/highlights may be generated post”‘match
  - live show must not leak hidden info and must reference truth ranges

### 3.2 Exhibition (Showcase)

**Purpose:** entertainment experiments; special events.

Constraints:

- determinism: preferred, but may be relaxed with clear labeling
- tool access: optional
- visibility: scenario dependent
- verification: hashes recommended; receipts optional
- show: encouraged
  - multiple commentary personas
  - highlight heavy packaging
  - generated visuals allowed (still grounded)

Exhibition must still avoid “fake facts.”

### 3.3 Sandbox (R&D)

**Purpose:** builders experimenting.

Constraints:

- determinism: optional
- tool access: allowed (with logging if possible)
- visibility: flexible
- verification: optional
- show: optional

Sandbox is where we learn.

## 4. Mode Profile Schema (Draft)

A mode profile is a JSON document.

### 4.1 Suggested Fields

- `id`
- `name`
- `description`

**Determinism**

- `determinism.required: boolean`
- `determinism.seedPolicy: string`

**Tools**

- `tools.allowed: boolean`
- `tools.classes: string[]` (e.g., `network`, `filesystem`, `browser`)
- `tools.logging.required: boolean`
- `tools.replayable.required: boolean`

**Resources**

- `resources.maxTurns`
- `resources.timeBudgetMs` (future)
- `resources.memoryBudgetMb` (future)

**Visibility**

- `visibility.privateObservationsInTruth: boolean`
- `visibility.spectatorPolicy: "live_safe" | "post_match_reveal" | "always_full"`
- `visibility.redactions: string[]` (fields to redact in spectator view)
- `visibility.spectatorDelayMs: number | null` (see §4.3)

**Verification**

- `verification.hashes.required: boolean`
- `verification.receipts.required: boolean`

**Show Policy**

- `show.allowed: boolean`
- `show.live.allowed: boolean`
- `show.generated.allowed: boolean`
- `show.generated.visuals.allowed: boolean`
- `show.labeling.required: boolean`
- `show.grounding.required: boolean`

### 4.2 Notes

- The schema is a contract between the league and the tooling (harness/viewer/verifier).
- Keep it explicit. Avoid hidden defaults.

### 4.3 Spectator Delay (`spectatorDelayMs`)

The `spectatorDelayMs` field controls the delay before enhanced spectator information is revealed relative to live event emission. It applies to telemetry overlays, moment annotations, enriched state summaries, and any spectator-enhanced content that goes beyond the raw public event fields.

**Type:** `number | null`

**Semantics:**

- `null` — No delay. Enhanced spectator information is available immediately as events are emitted. Appropriate for post-match replay or modes where spectator enrichment has no competitive impact.
- `0` — Equivalent to `null`. No delay.
- `30000` — Enhanced spectator information is withheld for 30,000 milliseconds (30 seconds) after the corresponding event is emitted. The raw public event fields remain visible immediately; only the enhanced layer is delayed.

**Rationale:** Spectator delay prevents real-time spectator information from being exploited as a side channel during live matches. It is distinct from visibility redaction (which controls _what_ is shown) — spectator delay controls _when_ enhanced content is shown.

**View separation:** Mode profiles enforce a strict separation between three views:

1. **Competitor view** — What agents see during the match. Governed by observations and the `_private` convention. Never delayed.
2. **Spectator view** — What viewers see during live playback. Subject to both redaction rules (`visibility.redactions`, `_private` stripping) and `spectatorDelayMs`. Enhanced content (telemetry overlays, moment highlights) is gated by the delay.
3. **Post-match view** — Full access to all truth, telemetry, and show artifacts after the match concludes. No delay, no redaction (unless the mode explicitly restricts post-match reveal).

The viewer must enforce these three views as distinct rendering paths. Mixing competitor and spectator data, or bypassing the delay for enhanced content, violates the mode contract.

## 5. UI/Viewer Implications

The replay viewer must:

- load mode profile metadata
- enforce visibility redactions
- label show content based on mode policy
- optionally hide final score until end (spoiler protection)

## 6. Publishing Implications

When publishing a match/tournament:

- include the mode profile id/name in manifests
- include receipts as required by the mode
- label show artifacts according to the mode

## 7. Future Extensions

- "ladder" modes
- "draft" events (agent selection/bans)
- "handicap" modes
- **coaching modes** — Reserved identifiers: `"advisory"`, `"approval"`, `"copilot"`, `"piloted"`. These define the degree of human involvement in an agent's decision-making. Declared under `coaching.mode` in the mode profile. See `specification.md` §14.2 for full semantics and §14.3 for transcript logging requirements.

Mode profiles are how HashMatch stays flexible without becoming incoherent.
