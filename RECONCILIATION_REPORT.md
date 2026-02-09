# Reconciliation Report — Post-Burst Docs Sweep

**Date:** 2026-02-09
**Scope:** Documentation reconciliation after PR burst (#108–#115)
**Branch:** `claude/post-burst-docs-reconciliation-htlLN`

---

## Corrections Made

1. **CLAUDE.md** — Test file count: 59 → 60 (added `tests/redaction-audit/redaction-audit.test.ts`)
2. **CLAUDE.md** — Scenario CLI description: "(list, generate, validate, preview)" → "(gen, validate, preview, describe, debug-view, layout-report)" to match actual subcommands in `src/cli/scenario.ts`
3. **Documents/hashmatch-action-plan.md** — Design document count in preamble: "Twenty-one" → "Thirty" (30 files currently in `Documents/`)
4. **DEV_NOTES.md** — Replay parser event type list: added `AgentRawOutput` and `InvalidAction` to match the 10-event discriminated union in `src/contract/types.ts` (was listing only 8)

## Previously Corrected (Already Accurate on Current `main`)

The following items were verified and found to already reflect the current codebase (likely corrected by recent PRs):

- **README.md** — Test file count: already 60
- **QUICKSTART.md** — Test file count: already 60
- **AGENTS.md** — Test file count: already 60
- **Documents/roadmap.md** — Heist test file counts: already 15 in both Milestone 7 definition and status section

## Drift Found but NOT Fixed

### Fenced files (artifact-writer consolidation territory)

- `src/tournament/artifacts.ts` and `src/server/matchArtifacts.ts` were not examined or modified per the active-work fence.

### Ambiguous or owner-decision items

1. **README.md verify commands use raw `dist/` paths** — The verification section shows `npm run build:engine && node dist/cli/verify-match.js` and similar for verify-tournament. While npm scripts exist for `verify-tournament`, `verify-receipt`, `sign-tournament`, and `validate-bundle` (which use `build:scripts` and output to `dist-scripts/`), the `build:engine` path also compiles CLI files to `dist/cli/`. Both paths work, but the README could be simplified to use `npm run verify-tournament -- --path ...` where scripts exist. Left as-is since both paths function correctly.

2. **`verify-match` has no npm run script** — Unlike `verify-tournament` and `verify-receipt`, there is no `npm run verify-match` convenience script. The README documents the manual `build:engine && node dist/cli/verify-match.js` invocation, which works. Consider adding an npm script for consistency.

3. **`scenario` and `generate-keys` have no npm run scripts** — These CLI tools are documented in QUICKSTART.md with manual `node dist/cli/scenario.js` invocations. This is functional but inconsistent with other CLIs that have npm script wrappers.

4. **Tournament harness tie-break: spec vs implementation** — `Documents/tournament_harness_v0.md` §14 notes that the implementation uses agentId lexicographic fallback for final tie-break, while the spec (`tournament_rules.md` §9) calls for a seed-derived coinflip. This is a pre-existing discrepancy documented in the harness spec's "Differences from this spec" table. Not a docs-only fix.

5. **`overview.md` SSE streaming reference** — Line 133 references "SSE-based match streaming (API endpoints exist: `src/app/api/matches/`)" which is correct — API route files exist at `src/app/api/matches/`. However, this capability is not mentioned in any other doc. Low-priority alignment item.

6. **`DEV_NOTES.md` replay viewer architecture** — The "How it works" section describes the original store-based replay flow (load into Zustand store, render via `/matches/[matchId]`). The current replay viewer at `/replay` uses a more direct approach. The description is not wrong but may be partially outdated in emphasis. Left as-is since the code paths still exist.

## Verified Accurate (No Drift Found)

- **Documents/specification.md** §5.2 event type table — All 10 event types match `src/contract/types.ts` discriminated union with correct field names
- **Documents/specification.md** §5.4 `_private` redaction semantics — Consistent with `src/lib/redaction/redactEvent.ts` implementation
- **Documents/artifact_packaging.md** — Match/tournament bundle layouts match current output structure
- **Documents/integrity_and_verification.md** — Implementation status section (§12) accurately reflects code: Phase A/B done, Phase C not started
- **Documents/replay_and_broadcast.md** §9 — Viewer documentation matches current web viewer capabilities (three modes, spoiler protection, filtering, tournament folder loading, sample replays)
- **Documents/tournament_harness_v0.md** §14 — Implementation status table is accurate
- **Documents/tournament_rules.md** — Scoring model (3/1/0) and tie-break order match docs
- **Documents/roadmap.md** — Milestone statuses accurately reflect current implementation state
- **Documents/hashmatch-action-plan.md** — Phase status markers and success criteria table are accurate
- **QUICKSTART.md** — CLI flags, scenario descriptions, agent interface, and verification instructions are all accurate
- **CONTRIBUTING.md** — Development setup and quality check commands are correct

## Open Questions

1. **Should npm scripts be added for `verify-match`, `scenario`, and `generate-keys`?** — Three CLI tools lack npm run convenience scripts while others have them. This is a code change, not a docs change.

2. **Should the `tournament.json` legacy dual-write be removed?** — Multiple docs mention the transitional dual-write of `tournament.json` alongside `tournament_manifest.json` "for one release." If this transition period is over, the code and docs should be updated to stop dual-writing. This touches `src/tournament/artifacts.ts` (fenced).
