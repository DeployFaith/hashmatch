# HashMatch Bloat & Efficiency Recon Report

## 1) Executive Summary

- The tournament artifact pipeline writes two identical manifest files (`tournament_manifest.json` + `tournament.json`) and then verifies them as byte-for-byte aliases, suggesting legacy duplication that could be collapsed later. (See `src/tournament/artifacts.ts`, `src/cli/verify-tournament.ts`.)
- Match/tournament verification logic is spread across `verify-match`, `verify-tournament`, and `core/bundleValidator`, all recomputing hashes and validations in parallel implementations. (See `src/cli/verify-match.ts`, `src/cli/verify-tournament.ts`, `src/core/bundleValidator.ts`.)
- There are multiple match execution pipelines (`runMatch`, `runMatchWithGateway`, `runMatchWithArtifacts`) and multiple artifact writers (`tournament/artifacts` vs `server/matchArtifacts`) that appear to duplicate responsibilities. (See `src/engine/runMatch*.ts`, `src/tournament/runMatchWithArtifacts.ts`, `src/tournament/artifacts.ts`, `src/server/matchArtifacts.ts`.)
- Build tooling appears duplicated: two TS build configs (`tsconfig.build.json` vs `tsconfig.scripts.json`) compile overlapping sources into two different output trees. (See both tsconfig files.)
- Replay parsing and redaction are duplicated in separate modules (strict vs tolerant parser, client vs server redaction), which may be intentional but increase maintenance cost. (See `src/lib/replay/parser.ts`, `src/lib/replay/parseJsonl.ts`, `src/lib/replay/redaction.ts`, `src/lib/redaction/redactEvent.ts`.)
- Several scripts and dependencies look unused in current code paths, e.g., Radix UI packages with no imports and redundant Next dev/build scripts. (See `package.json` and import scans.)
- Memory-heavy code paths (full JSONL reads, large in-memory match logs, validation re-reads) suggest potential performance hotspots for large tournaments and replays. (See `src/lib/replay/parseJsonl.ts`, `src/tournament/runTournament.ts`, `src/tournament/artifacts.ts`.)

## 2) TODO Queue (Actionable)

> Each item is recon-only. No changes made. Verify via targeted tests before removal.

### TODO-BLOAT-001 — Remove legacy tournament.json alias
- **Location:** `src/tournament/artifacts.ts` (`writeTournamentArtifacts`), `src/cli/verify-tournament.ts` (REQUIRED_FILES + aliasBytes)
- **Evidence:** The writer persists `tournament_manifest.json` and `tournament.json` with identical bytes, and the verifier explicitly checks that they match.
- **Recommendation:** Keep only `tournament_manifest.json` and drop the alias + alias check after confirming no consumers require the legacy filename.
- **Risk:** External tooling might read `tournament.json`. Validate with `verify-tournament`, `validate-bundle`, and any downstream consumers.

### TODO-BLOAT-002 — Consolidate match verification logic
- **Location:** `src/cli/verify-match.ts`, `src/core/bundleValidator.ts`, `src/tournament/artifacts.ts`
- **Evidence:** `verify-match` hashes logs and manifests; `bundleValidator` imports and calls `verifyMatchDirectory`; `writeTournamentArtifacts` calls `verifyMatchDirectory` and stores `verification_result.json`.
- **Recommendation:** Choose one verification core (likely `core/bundleValidator`) and have CLI + artifacts consume it to avoid divergent checks.
- **Risk:** CLI behavior and artifacts might change subtly; ensure tests and any verification consumers still pass.

### TODO-BLOAT-003 — Consolidate tournament verification logic
- **Location:** `src/cli/verify-tournament.ts`, `src/core/bundleValidator.ts`
- **Evidence:** `verify-tournament` recomputes truth bundle hash from `match_summary.json` logs; `bundleValidator` also recomputes hashes and validates structure/signatures.
- **Recommendation:** Make `verify-tournament` a thin wrapper around `bundleValidator` or deprecate it in favor of `validate-bundle`.
- **Risk:** `verify-tournament` might be used in CI or scripts; validate `validate-bundle` covers the same contract.

### TODO-BLOAT-004 — Consolidate match artifact writers
- **Location:** `src/tournament/artifacts.ts`, `src/server/matchArtifacts.ts`
- **Evidence:** Both write `match_manifest.json`, `match.jsonl`, `match_summary.json`, and `broadcast_manifest.json` with hash logic.
- **Recommendation:** Extract a shared writer or unify under one path to prevent drift in manifest formats.
- **Risk:** Server flow vs tournament flow may require subtly different metadata; confirm with match artifact consumers.

### TODO-BLOAT-005 — Simplify match execution pipelines
- **Location:** `src/engine/runMatch.ts`, `src/engine/runMatchWithGateway.ts`, `src/tournament/runMatchWithArtifacts.ts`
- **Evidence:** There are parallel execution flows: base engine, gateway-enabled engine, and tournament wrapper with artifact writing.
- **Recommendation:** Establish a single “match run” core with optional gateway + artifact hooks.
- **Risk:** Gateway behaviors (HTTP vs local) and artifact behaviors could regress. Validate `npm run match`, `npm run tournament`.

### TODO-BLOAT-006 — Remove duplicate TypeScript builds
- **Location:** `tsconfig.build.json`, `tsconfig.scripts.json`, `package.json` scripts
- **Evidence:** Both configs include `src/cli`, `src/core`, `src/tournament`, etc., emitting to `dist/` and `dist-scripts/`.
- **Recommendation:** Choose one build output target or split responsibilities clearly (engine vs scripts) to avoid double compile.
- **Risk:** Scripts rely on `dist-scripts` paths; confirm script entrypoints and CI before removing.

### TODO-BLOAT-007 — Resolve redundant Next.js scripts
- **Location:** `package.json` scripts
- **Evidence:** `dev`/`build` call `next ... --webpack` while `dev:turbo`/`build:turbo` call `next ...` without webpack. No other references found.
- **Recommendation:** Keep one set with explicit guidance in docs; remove unused aliases.
- **Risk:** Team workflow may rely on both; confirm usage with maintainers.

### TODO-BLOAT-008 — Remove unused dev-only mock SSE source
- **Location:** `src/lib/dev/mockEventSource.ts`
- **Evidence:** No imports found in `src/` besides a usage comment in the file header.
- **Recommendation:** Delete or move behind a dev-only flag/fixture if still useful.
- **Risk:** Might be used manually for demos; confirm before removal.

### TODO-BLOAT-009 — Consolidate replay parsing paths
- **Location:** `src/lib/replay/parseJsonl.ts`, `src/lib/replay/parser.ts`
- **Evidence:** Two JSONL parsers: tolerant + strict (Zod) with overlapping responsibilities.
- **Recommendation:** Pick one parser and expose strict vs tolerant modes via options.
- **Risk:** Client components and store rely on specific error behavior; verify replay UI.

### TODO-BLOAT-010 — Consolidate redaction logic
- **Location:** `src/lib/replay/redaction.ts`, `src/lib/redaction/redactEvent.ts`
- **Evidence:** Both implement `_private` stripping and redaction rules with different data shapes.
- **Recommendation:** Define a shared redaction policy module and adapt client/server as needed.
- **Risk:** Spectator visibility could change; verify live match SSE and replay UI.

### TODO-BLOAT-011 — Revisit mock data defaults in app store
- **Location:** `src/lib/store.ts`, `src/lib/mock/*`
- **Evidence:** Store initializes with mock agents/matches/events/runs/flows by default, which may be placeholder scaffolding.
- **Recommendation:** Gate mocks behind a dev flag or replace with API-backed data once available.
- **Risk:** UI may depend on mock data for demo mode; ensure fallback experience exists.

### TODO-BLOAT-012 — Avoid redundant verification_result writes
- **Location:** `src/tournament/artifacts.ts`
- **Evidence:** After writing match artifacts, the code reads back the files to run `verifyMatchDirectory` and writes `verification_result.json`.
- **Recommendation:** If verification is purely internal, compute hashes directly without a readback pass or move verification to a separate tool.
- **Risk:** External consumers might expect `verification_result.json`; confirm usage (e.g., API endpoints).

### TODO-BLOAT-013 — Unify tournament bundle builders
- **Location:** `src/tournament/artifacts.ts` (`writeTournamentArtifacts`, `buildTournamentBundle`)
- **Evidence:** Both create match manifests, moments, highlights, and bundles with overlapping logic.
- **Recommendation:** Extract shared builder to avoid double maintenance and mismatched output.
- **Risk:** Bundle consumers might expect current output; validate with tests + any downstream parsers.

### TODO-BLOAT-014 — Decouple core validators from CLI modules
- **Location:** `src/core/bundleValidator.ts` (imports `verifyMatchDirectory` from CLI)
- **Evidence:** `bundleValidator` depends on a CLI module, which is an inversion of layering and complicates reuse.
- **Recommendation:** Move shared verification logic into core and have CLI import it (not the other way around).
- **Risk:** Potential breaking changes if CLI behavior diverges; add tests around `verify-match`/`validate-bundle`.

### TODO-BLOAT-015 — Remove deprecated `ollama-heist` agent key
- **Location:** `src/tournament/runTournament.ts`
- **Evidence:** `ollama-heist` is explicitly marked deprecated and special-cased.
- **Recommendation:** Drop the deprecated alias after a deprecation window; keep only `llm:ollama:<model>`.
- **Risk:** Users of the old key will break; verify docs and release notes.

## 3) Potential Dependency Removals (Report-only)

| Package | Evidence of use | Suggested action |
| --- | --- | --- |
| `@radix-ui/react-label` | No imports found in `src/` (search for `react-label` returned none). | Remove if unused; use native `<label>` or existing UI components. |
| `@radix-ui/react-select` | No imports found in `src/` (search for `react-select` returned none). | Remove if unused; use custom select or native `<select>`. |
| `@radix-ui/react-switch` | No imports found in `src/` (search for `react-switch` returned none). | Remove if unused; use existing toggle UI or native checkbox. |

> Note: other dependencies (Three.js, Zustand, Zod, Radix tabs/slot/tooltip/separator) are actively imported.

## 4) Duplicate Path Inventory

- **Match execution**
  - **Pipeline A:** `src/engine/runMatch.ts` (core engine match runner)
  - **Pipeline B:** `src/engine/runMatchWithGateway.ts` (gateway-enabled runner)
  - **Pipeline C:** `src/tournament/runMatchWithArtifacts.ts` (gateway + artifact writing)
  - **Consolidation direction:** One core match runner with optional gateway/adapters + optional artifact hooks.

- **Match artifacts**
  - **Pipeline A:** `src/tournament/artifacts.ts` (tournament harness artifacts)
  - **Pipeline B:** `src/server/matchArtifacts.ts` (server-side artifacts)
  - **Consolidation direction:** Share a single artifact writer module; parameterize metadata differences.

- **Tournament verification**
  - **Pipeline A:** `src/cli/verify-tournament.ts`
  - **Pipeline B:** `src/core/bundleValidator.ts` (+ `src/cli/validate-bundle.ts`)
  - **Consolidation direction:** Prefer `bundleValidator` as canonical; keep CLI wrappers thin.

- **Replay parsing**
  - **Pipeline A:** `src/lib/replay/parseJsonl.ts` (tolerant)
  - **Pipeline B:** `src/lib/replay/parser.ts` (strict Zod validation)
  - **Consolidation direction:** Single parser with mode flag or shared core parser.

- **Redaction**
  - **Pipeline A:** `src/lib/replay/redaction.ts` (client replay rendering)
  - **Pipeline B:** `src/lib/redaction/redactEvent.ts` (server SSE redaction)
  - **Consolidation direction:** Shared policy module with per-context adapters.

## 5) Efficiency Smells (Likely Hotspots)

- **Full JSONL parse + sort:** `parseJsonl` and `parseReplayJsonl` split the entire file into memory and sort events; large replays may spike memory/time. Measure with a large JSONL file and profile parse time. (Files: `src/lib/replay/parseJsonl.ts`, `src/lib/replay/parser.ts`.)
- **Tournament event logs in memory:** `runTournament` stores `matchLogs` for every match when `includeEventLogs` is enabled, which scales O(matches × turns). Profile memory usage for tournaments with many agents. (File: `src/tournament/runTournament.ts`.)
- **Readback verification per match:** `writeTournamentArtifacts` re-reads each match’s artifacts to verify hashes, adding extra IO. Measure total runtime with/without verification_result writes. (File: `src/tournament/artifacts.ts`.)
- **Deep clone per redaction:** `lib/replay/redaction` uses JSON stringify/parse for cloning on each event; this can be costly in large event streams. Profile in replay UI. (File: `src/lib/replay/redaction.ts`.)
- **Bundle validation walk:** `bundleValidator` recursively reads directory trees and accumulates file lists; in large tournaments this can be heavy. Measure validation time and IO. (File: `src/core/bundleValidator.ts`.)

## 6) Non-Issues / Keep List

- **Stable stringification & hashing (`stableStringify`, `hashManifestCore`)** are justified for reproducible hashing in receipts/manifests.
- **Gateway adapter abstraction** (`src/gateway/*`, `runMatchWithGateway`) is justified if HTTP agent execution is an active roadmap item.
- **Replay redaction vs server redaction** appears intentionally separate to serve different data shapes, but should be aligned—not necessarily removed.
- **Tournament provenance and receipts** add legitimacy for auditability; keep while making workflows clearer.

