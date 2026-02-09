# Audit Report: Drift Detection & Correction

**Date:** 2026-02-09
**Branch:** `claude/audit-drift-correction-J4Teq`
**Scope:** Documentation, code comments, TypeScript types/annotations -- factual corrections only

---

## Corrections Made

### specification.md

- **Event type fields updated** (`Documents/specification.md`): `ActionAdjudicated` event now lists all actual fields (`method`, `warnings`, `errors`, `fallbackReason`, `chosenAction`). `AgentRawOutput` fields corrected from `rawOutput`/`sha256`/`bytes` to `rawSha256`/`rawBytes`/`truncated`/`raw`/`_privateRaw`. Added missing `InvalidAction` event type. Added optional `errorType` field to `AgentError`.

### heist_game_contract_v0.md (highest drift risk area)

- **Action space rewritten** (`Documents/heist_game_contract_v0.md` section 2): Replaced spec-only `interact(targetEntityId, using?)` and `use_item(itemId)` with actual implemented actions: `{ type: "move", toRoomId }`, `{ type: "pickup", itemId }`, `{ type: "use_terminal", terminalId }`, `{ type: "extract" }`, `{ type: "wait" }`.
- **Observation model rewritten** (section 3): Replaced `location`, `visibleRooms`, `turnsRemaining`, `alertLevel`, `objectives` with actual fields: `currentRoomId`, `adjacentRooms` (with door metadata), `visibleItems`, `visibleEntities`, `inventory` (as `{ itemId, type }` objects), `turn`. Updated `_private` fields to match code: `map`, `entities`, `items`, `alertLevel`, `extractionRoomId`, `terminalProgress`, `terminalHacked`.
- **Tension model updated** (section 4): Documented that per-action noise tracking (noiseTable) is defined in params but not yet implemented in the scenario. Alert level currently increments only on invalid actions. `captureOnMaxAlert` defaults to `false` and `isTerminal` does not check alert level.
- **Guard behavior updated** (section 5): Documented that guards are positional data only in v0 -- detection range and pursuit mechanics are defined in types but not implemented in scenario code.
- **Entity interaction table replaced** (section 6): Replaced generic `interact` lookup table with actual per-action-type behavior table matching the code.
- **Params schema updated** (section 12): Corrected door field from `keycardLevel` to `requiredItem`. Corrected intel item field from `grantedBy` to `label`. Added `maxAlertLevel`, `captureOnMaxAlert`, `invalidActionFallback`, `successGrants` to rules/entity fields.
- **Differences table expanded** (section 14): Added entries for action space change, observation field renames, guard detection gap, noise tracking gap, and door field rename.

### agent_adapter_spec.md

- **Heist observation example rewritten** (`Documents/agent_adapter_spec.md` section 2): Replaced `currentRoom`, `inventory` (strings), `alertLevel`, `currentNoise`, `connectedRooms`, `score` with actual `currentRoomId`, `adjacentRooms` (with door objects), `visibleItems`, `visibleEntities`, `inventory` (with `{ itemId, type }` objects), `_private` block.
- **ResourceRivals observation example rewritten** (section 2): Replaced `resources`, `score`, `opponentScore`, `roundsRemaining`, `lastRoundResult` with actual `objectiveValue`, `capturedScore`, `objectivesRemaining`, `opponentCapturedScore`, `lastResult`, `_private.remainingResources`.
- **`_private` visibility note corrected** (section 2): `_private` fields ARE sent to agents; they are stripped for spectator views only, not agent views.
- **Heist action examples rewritten** (section 3): Replaced `{ type: "move", target }`, `{ type: "use", item, target }`, `{ type: "interact", target }` with actual `{ type: "move", toRoomId }`, `{ type: "pickup", itemId }`, `{ type: "use_terminal", terminalId }`, `{ type: "extract" }`.
- **Code examples updated** (sections 7): Updated Pattern A valid action list, Pattern C rule-based example field references, Pattern D HTTP adapter response example.

### tournament_harness_v0.md

- **Receipts section updated** (`Documents/tournament_harness_v0.md` section 10.2): Changed from "Receipts (Later) -- In v0, signatures are optional" to documenting that receipts are implemented with references to `src/core/receipt.ts`, `src/cli/sign-tournament.ts`, `src/cli/verify-receipt.ts`.

### CLAUDE.md

- **Test file count corrected** (`CLAUDE.md`): Changed "56 test files" to "59 test files".
- **Repository structure updated** (`CLAUDE.md`): Added missing `src/hooks/` (React hooks) and `src/arena/` (arena visualization) directories.
- **CLI entry points updated** (`CLAUDE.md`): Added missing entries: `verify-receipt`, `sign-tournament`, `validate-bundle`, `generate-keys`.
- **Secrets policy reference corrected** (`CLAUDE.md`): Changed `specification.md` section reference from `section 9` (Moments Contract) to `section 5.3-5.4` (`_private` field-level redaction).

---

## TODOs Added

### `src/scenarios/heist/index.ts` -- Per-action noise tracking

```
TODO(hashmatch): Implement per-action noise tracking using rules.noiseTable
```
The `noiseTable`, `alertThresholds`, and `noiseDecayRate` are defined in `HeistRules` but not used during adjudication. Currently `alertLevel` only increments on invalid actions.

### `src/scenarios/heist/index.ts` -- Guard detection mechanics

```
TODO(hashmatch): Implement guard detection mechanics
```
Guards have `patrolRoute` and `detectionRange` defined in `HeistGuardEntity` but are excluded from observations and do not trigger detection events.

### `src/scenarios/heist/index.ts` -- `captureOnMaxAlert` in `isTerminal`

```
TODO(hashmatch): Check captureOnMaxAlert in isTerminal
```
`rules.captureOnMaxAlert` is defined and defaults to `false`, but `isTerminal` never checks alert level even when set to `true`.

### `src/tournament/standings.ts` -- Full tie-break chain

```
TODO(hashmatch): Implement full tie-break chain per tournament_harness_v0.md section 8.2
```
Spec requires: head-to-head -> scoreDiff -> totalPointsScored -> seed-derived coinflip. Current implementation only uses scoreDiff -> lexicographic agentId fallback.

### `src/tournament/artifacts.ts` -- Existing TODO (pre-existing)

```
TODO: Add highlights.json to broadcast_manifest.json (class: "show") when available.
```
This TODO already existed in the codebase at line 224.

---

## Bugs Found (Not Fixed)

None. All drift found was documentation-vs-code inconsistency, not behavioral bugs.

---

## Open Questions (Require Owner Decision)

1. **Heist difficulty presets naming**: Spec says "easy/medium/hard" (heist_game_contract_v0.md section 11), generator implements "easy/normal/hard/expert". The "Differences from spec" table already documents this, but the spec body (section 11) still says "easy / medium / hard". Should the spec be updated to match code ("easy / normal / hard / expert") or is "medium" intentionally kept as a spec-level alias?

2. **Tournament tie-break: head-to-head record**: The spec (tournament_harness_v0.md section 8.2) calls for head-to-head record as the first tie-breaker, but `computeStandings()` does not have access to per-matchup results. Implementing this requires passing the full match list or a head-to-head matrix into the sort. Is this a priority, or is the current scoreDiff -> agentId fallback acceptable for v0?

3. **Tournament `tournament.json` legacy dual-write**: The roadmap says the harness "dual-writes legacy `tournament.json` for one transitional release." Is this transition period over and should `tournament.json` writing be removed?

4. **Scoring example values in heist contract**: Section 7 says `objectiveSecured` is "Large fixed points (e.g., 1000)" and `extractionBonus` is "Fixed points (e.g., 500)" but code defaults are 100 and 150 respectively. These are labeled as examples but could mislead agent builders about the actual scale. Should the doc examples match the code defaults?

---

## Areas of Concern

1. **heist_game_contract_v0.md was the highest drift area**: The action space, observation model, guard behavior, and noise/alert mechanics had all diverged significantly from the implementation. The implementation uses specific typed actions (`pickup`, `use_terminal`, `extract`) rather than the generic `interact`/`use_item` verbs described in the original spec. This is a major interface difference that would mislead anyone building a heist agent from the docs alone.

2. **agent_adapter_spec.md examples were stale**: Every code example and JSON sample for heist observations/actions used old field names and action shapes. An agent builder following these examples would produce invalid actions.

3. **`_private` field semantics were incorrectly documented**: The agent adapter spec stated `_private` fields are "never sent to the agent" -- in reality they ARE sent to agents and are only stripped for spectator/replay views. This is a critical distinction for agent builders who might rely on `_private` data.

4. **Heist noise/alert model is partially implemented**: The params define a full noise tracking system (noise table, decay, thresholds) but the scenario only increments `alertLevel` on invalid actions. The `captureOnMaxAlert` flag exists but `isTerminal` doesn't check it. This is a gap between the designed mechanics and the v0 implementation.

5. **Tournament standings tie-breaking is simplified**: The spec defines a 4-level tie-break chain (head-to-head, scoreDiff, totalPointsScored, seed-derived coinflip) but the implementation only uses scoreDiff then lexicographic agentId. This could matter in tight tournaments.

---

## Verification

- `npm run lint`: Pass (0 errors)
- `npm run typecheck`: Pass (0 errors)
- `npm test`: Pass (60 test files, 489 tests passed, 2 skipped, 0 failures)
- No test assertions modified
- No runtime behavior changed
- No files added except this `AUDIT_REPORT.md`
- No files deleted
