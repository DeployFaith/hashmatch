# M4 Battle-Test Audit Report

**Date:** 2026-02-09
**Branch under test:** `main` (via `claude/m4-battle-test-audit-WPI9l`)
**Auditor:** Claude Code (automated)

---

## Results

| Gate | Pass / Fail | Evidence | Notes |
|------|------------|----------|-------|
| G1 — Receipt Verification | **PASS** | Ran 3-agent tournament (seed=1001), signed with `sign-tournament`, verified with `verify-receipt`. Output: `Status: PASS`, `Matches: 3 (✓ 3 passed, ✗ 0 failed)`, `Tournament receipt: PASS`, `Errors: 0`. All logHash, manifestHash, truthBundleHash, and signature checks passed. | |
| G2 — Signed Bundle Validation | **FAIL** | Ran `validate-bundle --path <dir> --require-signatures --verbose`. Output: `Result: PASS (4 warnings)`. Warnings: `⚠ UNLISTED: matches/*/receipt.json` (×3), `⚠ UNLISTED: tournament_receipt.json` (×1). Broadcast manifest does not include receipt files because receipts are signed after the manifest is generated. | Gate requires "no warnings or ambiguity." 4 warnings present. The broadcast manifest is generated at tournament time; receipts added by `sign-tournament` afterward are not retroactively added to the manifest. |
| G3 — MatchSetupFailed × Receipt Composition | **FAIL** | (a) Forced setup failure via `--agents "llm:ollama:qwen2.5:3b,noop"` (ollama unreachable). Artifacts produced: `match.jsonl` (2 well-formed JSONL events: MatchSetupFailed + MatchEnded), `match_status.json`. **No `match_manifest.json` produced.** (b) Attempted tournament with failing LLM agent: `preflightValidateLlmAgents` throws at tournament start, aborting entirely — no tournament directory created, no matches run. | Three failures: (1) `match_manifest.json` is not written for preflight failures — gate requires it. (2) `match_summary.json` is not written either — signing/verification pipeline requires it. (3) Tournament cannot contain a MatchSetupFailed match because LLM preflight runs once at tournament start and aborts on failure — failed matches cannot compose into tournament receipts. |
| G4 — Determinism | **FAIL** | Ran identical tournament twice (seed=4004, agents=random,baseline,noop, scenario=numberGuess). `match.jsonl` files: byte-identical ✓. `match_summary.json` files: byte-identical ✓. `standings.json`: byte-identical ✓. `truthBundleHash`: identical (`sha256:fd3561c0...`) ✓. **`match_manifest.json` files differ** — sole difference is `createdAt` timestamp (e.g., `2026-02-09T08:34:17.400Z` vs `2026-02-09T08:34:22.497Z`). `tournament_manifest.json` and `tournament.json` also differ by `createdAt`. SHA-256 hashes of manifest files diverge across runs. | Gate requires byte-identical output directories. The `createdAt` field in `match_manifest.json`, `tournament_manifest.json`, and `tournament.json` is wall-clock time, not seed-derived, breaking byte-level determinism. All content-derived hashes (logHash, truthBundleHash) are deterministic. |
| G5 — Tamper Detection | **PASS** | Appended `{"type":"TAMPERED","seq":99}` to one `match.jsonl`. `verify-receipt` output: `FAIL` with `logHash mismatch` for specific match (`matches/RR:baseline-1-vs-noop-2:round1`), expected hash `sha256:521366a4...`, actual `sha256:9faca008...`. Also caught `truthBundleHash mismatch` at tournament level. `validate-bundle` output: `HASH MISMATCH: matches/RR:baseline-1-vs-noop-2:round1/match.jsonl — expected sha256:521366a4..., got sha256:9faca008...`. | Error messages include: specific artifact name ✓, check that failed ✓, expected hash ✓, actual hash ✓. |
| G6 — Key Lifecycle Sanity | **PASS** | Generated two key pairs (`generate-keys`). Signed G1 tournament with key A. Verified with key A: `Status: PASS`. Verified with key B (wrong): `Status: FAIL`, 8 errors — each match + tournament receipt reports `receipt publicKey does not match provided public key` and `receipt signature does not match provided public key`. Verified tampered artifacts with key A: `Status: FAIL`, `logHash mismatch` with specific artifact named. | All error messages are explicit and intelligible. |
| G7 — Private Key Safety | **PASS** | `.gitignore` contains `*.pem`, `*.key`, and `/keys/*` with exception `!/keys/*.pub.pem`. `git add test-secret.key` → rejected: "The following paths are ignored by one of your .gitignore files." `git add test-secret.pem` → rejected. `git add keys/organizer.key` → rejected. `git add keys/organizer.pub.pem` → accepted (public key, correct behavior). | Private key material cannot be staged without `--force`. |

---

## Summary

- **Gates passed:** 4 / 7 (G1, G5, G6, G7)
- **Gates failed:** 3 / 7 (G2, G3, G4)

### Concrete Fix List

1. **G2 fix:** `sign-tournament` (or a post-signing step) must update the broadcast manifest to include receipt files (`receipt.json`, `tournament_receipt.json`), so `validate-bundle --require-signatures` produces zero warnings.

2. **G3 fix (artifacts):** `writePreflightFailureArtifacts` must also produce `match_manifest.json` and `match_summary.json` for MatchSetupFailed matches, enabling the signing and verification pipeline to operate on failed matches.

3. **G3 fix (tournament composition):** The tournament must be capable of containing MatchSetupFailed results. Either: (a) move LLM preflight to per-match execution within the tournament loop so failures are captured as match results rather than aborting the tournament, or (b) provide an alternate mechanism for a match to fail setup while the tournament continues.

4. **G4 fix:** Remove `createdAt` from `match_manifest.json`, `tournament_manifest.json`, and `tournament.json` — or derive it deterministically from the seed. All fields in determinism-critical artifacts must be seed-derived or constant.
