# HashMatch — Execution Prompts (v4 — Final)

**How to use this document:** Each section is a self-contained prompt for either **Claude Code** or **Codex**. Execute them in the order listed. Each prompt includes full context so the agent can work independently.

**Agent assignment:**
- **Claude Code:** Spec document editing, doc reconciliation
- **Codex:** Backend TypeScript, CLI tools, hashing, scenario implementation, algorithmic work

---

## Global Rules (apply to every prompt)

Every prompt in this pack operates under these rules:

1. **Do not rename or move existing files unless explicitly instructed.**
2. **If you discover the repo structure differs from what this prompt assumes, stop and report the mismatch instead of guessing.** Do not invent paths, flag names, or function signatures.
3. **Definition of done for code prompts:** All changes committed on a feature branch (`phase-X.Y/description`). `npm test`, `npm run lint`, and `npm run typecheck` all pass. Include one sample run output directory for manual inspection. Do not commit directly to main.
4. **Do not commit generated run outputs to git.** Generate sample outputs locally and report the path in your notes; only commit them if explicitly instructed.
5. **Definition of done for doc prompts:** All changes committed on a feature branch. No internal contradictions remain in modified files. Commit message describes what was changed and why.
6. **Preserve existing behavior.** Unless the prompt says otherwise, existing tests must continue to pass, existing CLI flags must continue to work, and existing output formats must not change.

---

## Prompt 1 — Phase 0: Decision Locks

**Agent:** Claude Code
**Branch:** `phase-0/decision-locks`
**Depends on:** Nothing
**Scope:** Edit spec documents only — no code changes

```
You are editing the design documents for HashMatch, a competitive league for autonomous agents ("UFC for Agents"). The project has a working tournament harness and replay viewer, but several spec documents contain internal contradictions that must be resolved before new code ships.

RULES:
- Do not rename or move files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- Make no code changes — this is a documentation-only task.
- Commit all changes on branch `phase-0/decision-locks`.

Your task: Record four "decision locks" into the spec documents. For each lock, update EVERY document listed so there is exactly one canonical answer with zero contradictions. Delete or update any text that conflicts.

## Lock 1: Canonical Filenames

The codebase currently writes `tournament.json`. Multiple docs reference `tournament_manifest.json`. Resolve this:

- The canonical tournament manifest filename is `tournament_manifest.json`
- The canonical per-match manifest filename is `match_manifest.json`
- `match_summary.json` and `standings.json` are already consistent — no change

Update ALL of these files (do not skip any):
- `Documents/specification.md` §3–4: Make these the canonical artifact names
- `Documents/tournament_harness_v0.md`: Update all references. Update the "Differences from this spec" table. Add a note that for one transitional release, the harness will dual-write both `tournament.json` and `tournament_manifest.json`, then deprecate `tournament.json`.
- `Documents/artifact_packaging.md` §3–4: Verify filenames match, update if needed
- `Documents/roadmap.md`: Update status tables and filename references
- `Documents/integrity_and_verification.md` §3: Verify manifest filename references
- `Documents/replay_and_broadcast.md` §2.3, §8: Verify filenames match
- `Documents/tournament_rules.md` §11: Verify publishing requirements reference correct filenames

## Lock 2: Scoring Model

The code uses win=3, draw=1, loss=0. But `Documents/tournament_harness_v0.md` §8.1 says win=1, loss=0. Resolve this:

- Canonical scoring: win=3, draw=1, loss=0
- This aligns with the "discourage ties" product direction

Standings sort: **points first** (the primary ranking key), then apply tie-breakers in this order when points are equal:
1. Head-to-head record
2. Total score differential (pointsFor − pointsAgainst)
3. Total points scored (pointsFor — the aggregate match score, NOT standings points)
4. Deterministic seed-derived coinflip (last resort, prevents ambiguity)

IMPORTANT: "Points" is the primary sort key, NOT a tie-breaker. Tie-breakers only apply when two agents have equal points. Write this distinction clearly.

IMPORTANT: "Total points scored" means aggregate match score (pointsFor), NOT standings points. Use the label `totalPointsScored` to avoid ambiguity. Write this distinction clearly.

Update these files:
- `Documents/tournament_harness_v0.md` §8.1: Replace win=1/loss=0 text with win=3/draw=1/loss=0. Add the tie-breaker order with clear framing.
- `Documents/tournament_rules.md` §8–9: Make this the single source of truth for scoring and tie-breaks.
- `Documents/roadmap.md`: Update the "Gaps vs spec" note about scoring to say "resolved — spec updated to match implementation (win=3/draw=1/loss=0)"

## Lock 3: Hashing Rules

`Documents/integrity_and_verification.md` §5 describes hashing at a high level but lacks byte-level rules. Add a new subsection §5.4 titled "Byte-Level Hashing Contract" with these exact rules:

```
### 5.4 Byte-Level Hashing Contract

These rules ensure cross-platform portable verification.

**General:**
- Hash algorithm: SHA-256
- Encoding: UTF-8, no BOM
- Hashes are represented as lowercase hex strings prefixed with `sha256:`

**Two hashing modes:**

1. **File-bytes hashing** (used for `logHash`):
   - Hash the raw bytes of the file as written to disk
   - Never re-parse and re-serialize before hashing

2. **ManifestCore hashing** (used for `manifestHash`):
   - Remove excluded fields (e.g., `createdAt`) from the manifest object
   - Serialize the remaining object using the project's stable JSON serializer
   - Ensure the output ends with exactly one final `\n`
   - Hash the resulting UTF-8 bytes
   - This intentionally hashes a canonical serialization, NOT the file on disk

**JSONL file contract (`match.jsonl`):**
- Every line ends with `\n` (LF, 0x0A)
- The file ends with a final `\n` (no content after the last newline)
- No trailing spaces on any line
- One JSON object per line, serialized by the stable serializer

**JSON file contract (manifests, summaries):**
- Written by the stable JSON serializer with deterministic key ordering
- File ends with exactly one final `\n`

**Integrity vs Authenticity:**
- Hashes provide integrity: proof that nothing changed since publication
- Hashes do NOT provide authenticity: they don't prove who published it
- Authenticity requires signed receipts (future work)
```

Also add a brief cross-reference from `Documents/artifact_packaging.md` §7: "See `integrity_and_verification.md` §5.4 for byte-level hashing rules."

## Lock 4: Moments Ownership

The docs are ambiguous about whether the harness or the viewer produces `moments.json`. Resolve this:

Update `Documents/replay_and_broadcast.md` §4 to add:

```
### Moment Production Rules

- Moment detection logic lives in a shared library (e.g., `src/lib/replay/detectMoments.ts`)
- The viewer always computes moments on-the-fly for immediate UX
- The harness may optionally write `moments.json` as a published telemetry artifact
- If `moments.json` exists in a loaded bundle, the viewer uses it instead of computing its own
- Both harness and viewer use the same shared library, ensuring identical results
```

Update `Documents/specification.md` §9 to add: "Moments may be computed by the viewer on-the-fly or loaded from a published `moments.json` file. If both are available, the published file takes precedence."

Update `Documents/tournament_harness_v0.md` §11 to clarify: "The harness MAY produce `moments.json` using the shared moment detection library. This is optional. If produced, it is a telemetry-layer artifact."

## Final check

After all edits, read through EVERY modified document and confirm:
- No remaining references to `tournament.json` as the canonical name (except the dual-write transition note)
- No remaining references to win=1/loss=0 scoring
- Hashing rules appear in one place (integrity doc §5.4) with cross-references elsewhere
- Moments ownership is unambiguous
- Tie-breaker language correctly frames points as primary sort key, not as a tie-breaker
- "Total points scored" is clearly labeled as aggregate match score (pointsFor), not standings points

Commit message: "Lock decision contracts: filenames, scoring, hashing rules, moments ownership"
```

---

## Prompt 2 — Phase 1.1–1.2: Manifest Production

**Agent:** Codex
**Branch:** `phase-1.1/match-manifests`
**Depends on:** Prompt 1 (decision locks recorded)
**Scope:** Modify artifact writing, add types, update bundle

```
You are working on HashMatch, a TypeScript project that runs deterministic tournaments between autonomous agents.

RULES:
- Do not rename or move existing files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- All changes on branch `phase-1.1/match-manifests`.
- Definition of done: `npm test`, `npm run lint`, `npm run typecheck` pass. Include one sample tournament run output for inspection.
- Preserve all existing behavior — existing tests must pass, existing CLI flags must work, existing output formats must not change.

## Context: Existing Code

- `src/core/json.ts` — stable JSON serializer (deterministic key ordering). Use this for ALL manifest writes.
- `src/core/rng.ts` — seeded PRNG (Mulberry32) and `deriveMatchSeed()` using FNV-1a32.
- `src/tournament/artifacts.ts` — contains `writeTournamentArtifacts()` and `writeTournamentBundle()`.
- `src/cli/run-tournament.ts` — CLI with flags: `--seed`, `--rounds`, `--maxTurns`, `--scenario`, `--agents`, `--outDir`, `--bundle-out`.
- The CLI may support optional provenance flags (`--engineCommit`, `--engineVersion`). Use whatever provenance fields the CLI currently supports; do NOT add new CLI flags.

## Task 1: Define manifest types

Create `src/types/manifests.ts` with TypeScript interfaces:

```typescript
export interface MatchManifest {
  matchId: string;
  modeProfileId: string;  // default: "sandbox"
  scenario: {
    id: string;
    version: string;
    contractVersion?: string;
    contentHash?: string;  // placeholder for future
  };
  agents: Array<{
    id: string;
    version?: string;
    contentHash?: string;  // placeholder for future
  }>;
  config: {
    maxTurns: number;
    seed: number;
    seedDerivationInputs?: {
      tournamentSeed: number;
      matchKey: string;
    };
  };
  runner: {
    name: string;  // "hashmatch"
    version?: string;
    gitCommit?: string;
  };
  createdAt?: string;  // ISO 8601, excluded from hash scope
}

export interface TournamentManifest {
  tournamentId: string;
  title?: string;
  modeProfileId: string;  // default: "sandbox"
  harnessVersion?: string;
  tournamentSeed: number;
  seedDerivation: string;  // e.g., "FNV-1a32(tournamentSeed || matchKey)"
  scoringModel: {
    win: number;   // 3
    draw: number;  // 1
    loss: number;  // 0
  };
  tieBreakers: string[];  // ["headToHead", "scoreDifferential", "totalPointsScored", "seedCoinflip"]
  scenario: {
    id: string;
    version: string;
    contentHash?: string;
  };
  participants: Array<{
    agentId: string;
    owner?: string;
    version?: string;
  }>;
  matches: Array<{
    matchId: string;
    matchKey: string;
    seed: number;
    agentIds: string[];
    outputPath: string;
  }>;
  createdAt?: string;  // excluded from hash scope
}
```

IMPORTANT: The `tieBreakers` array uses `"totalPointsScored"` (meaning aggregate match score / pointsFor), NOT `"totalPoints"` (which could be confused with standings points). Use this exact string consistently.

## Task 2: Write match_manifest.json per match

In the artifact-writing flow (likely `src/tournament/artifacts.ts`):

- After each match completes and `match.jsonl` is written, also write `match_manifest.json` in the same match directory.
- Populate all fields from data already available in the harness.
- Use the stable JSON serializer from `src/core/json.ts`.
- Ensure the output ends with exactly one final `\n`. Check whether the stable serializer already appends `\n` — if it does, do not append another. If it does not, append exactly one.
- Set `createdAt` to `new Date().toISOString()`.

## Task 3: Write tournament_manifest.json

After all matches complete, write `tournament_manifest.json` alongside `standings.json`:

- Include the full match list with matchKey, seed, agentIds, and output path.
- Include `scoringModel: { win: 3, draw: 1, loss: 0 }`.
- Include `tieBreakers: ["headToHead", "scoreDifferential", "totalPointsScored", "seedCoinflip"]`.
- Use the stable JSON serializer. Ensure exactly one final `\n`.
- Set `createdAt` to `new Date().toISOString()`.

**Backward compatibility:** ALSO write `tournament.json` with identical content. Add a code comment: `// DEPRECATED: dual-write for backward compatibility. Remove tournament.json after one release.`

## Task 4: Update the single-file tournament bundle

If `--bundle-out` is used, the bundle should embed the new `tournament_manifest.json` content and per-match `match_manifest.json` content alongside existing data. Preserve the existing bundle schema — only add new keys, do not rename existing ones.

## Task 5: Tests

- `match_manifest.json` is written for every match in a tournament run
- `tournament_manifest.json` is written with expected fields
- Both `tournament.json` and `tournament_manifest.json` are written (dual-write)
- **Determinism test:** Run the same tournament twice with identical seeds. For each manifest, strip the `createdAt` field and compare the remaining bytes. They must be byte-identical. (Alternatively, hash the manifestCore of each and compare hashes.)
- Files end with exactly one `\n` (not zero, not two)
- `tieBreakers` array contains `"totalPointsScored"` (not `"totalPoints"`)
- All existing tests still pass

## Constraints

- Do NOT modify `match.jsonl` output format
- Do NOT modify `match_summary.json` format (hashes will be added in the next prompt)
- Do NOT change seed derivation logic
- Do NOT change the scoring/standings computation
- Do NOT add new CLI flags
```

---

## Prompt 3 — Phase 1.3: SHA-256 Hashing

**Agent:** Codex
**Branch:** `phase-1.3/hashing`
**Depends on:** Prompt 2 (manifests exist)
**Scope:** New hashing module, integrate into artifact writing

```
You are adding SHA-256 hashing to HashMatch's tournament harness.

RULES:
- Do not rename or move existing files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- All changes on branch `phase-1.3/hashing`.
- Definition of done: `npm test`, `npm run lint`, `npm run typecheck` pass. Include sample output showing hashes in match_summary.json.
- Preserve all existing behavior.

## Context

- `src/core/json.ts` — stable JSON serializer. Check whether its output already ends with `\n`.
- `src/tournament/artifacts.ts` — writes all output files
- `match_manifest.json` exists per match (from previous work) with a `createdAt` field excluded from hash scope
- `match_summary.json` exists per match
- `tournament_manifest.json` exists (from previous work) with a `createdAt` field
- Node.js `crypto` module is available — no external deps needed

## Two distinct hashing modes

1. **`logHash`** — file-bytes hashing:
   - Read raw bytes of `match.jsonl` from disk
   - Compute SHA-256 of those exact bytes
   - Never re-parse or re-serialize

2. **`manifestHash`** — manifestCore hashing:
   - Take the match manifest OBJECT (as used when writing the file)
   - Remove `createdAt` (and any future excluded fields)
   - Serialize using the stable JSON serializer
   - Ensure the result ends with exactly one `\n` (check serializer behavior; do not double-append)
   - Compute SHA-256 of the resulting UTF-8 bytes
   - This intentionally hashes a canonical serialization, NOT the file bytes on disk

Both produce hashes as lowercase hex strings prefixed with `sha256:`.

## Task 1: Create hashing utility

Create `src/core/hash.ts`:

```typescript
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
// Import the stable serializer from src/core/json.ts — use whatever it actually exports

/**
 * SHA-256 hash of raw bytes. Returns "sha256:" + lowercase hex.
 */
export function sha256Hex(bytes: Buffer): string {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}

/**
 * SHA-256 hash of a file's raw bytes on disk.
 */
export async function hashFile(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return sha256Hex(bytes);
}

/**
 * SHA-256 hash of manifestCore: manifest object with excluded fields removed,
 * serialized by the stable serializer, ending with exactly one \n.
 */
export function hashManifestCore(
  manifest: Record<string, unknown>,
  excludeFields: string[] = ['createdAt']
): string {
  const core = { ...manifest };
  for (const field of excludeFields) {
    delete core[field];
  }
  let serialized = stableSerialize(core); // use actual export name
  // Normalize to exactly one trailing \n (collapse \n\n, add if missing)
  serialized = serialized.replace(/\n*$/, '\n');
  return sha256Hex(Buffer.from(serialized, 'utf-8'));
}
```

Adapt import names to match what `src/core/json.ts` actually exports.

## Task 2: Compute and store hashes per match

In `src/tournament/artifacts.ts`, AFTER writing `match.jsonl` and `match_manifest.json` to disk:

1. `logHash = await hashFile(path/to/match.jsonl)`
2. `manifestHash = hashManifestCore(matchManifestObject)` — use the in-memory manifest object that was used to write the file, not re-read from disk
3. Add a `hashes` field to `match_summary.json`:

```json
{
  "...existing fields...",
  "hashes": {
    "logHash": "sha256:abc123...",
    "manifestHash": "sha256:def456..."
  }
}
```

Write `match_summary.json` AFTER computing hashes.

## Task 3: Tournament-level truth hash

After all matches complete and all per-match hashes are computed:
- Collect all `logHash` string values
- Sort lexicographically
- Concatenate into a single string (no separator)
- SHA-256 hash that string → `truthBundleHash`
- Add `truthBundleHash` to the tournament manifest

IMPORTANT: When rewriting `tournament_manifest.json` to add `truthBundleHash`, parse the existing file and PRESERVE the original `createdAt` value. Do not mint a new timestamp. Re-serialize with the stable serializer and ensure exactly one trailing `\n`. Also update the dual-write `tournament.json` with the same content.

## Task 4: Tests

- Same `match.jsonl` → same `logHash` (determinism)
- Changing `createdAt` in manifest does NOT change `manifestHash`
- Changing any OTHER manifest field DOES change `manifestHash`
- Hash format: regex `^sha256:[a-f0-9]{64}$`
- `match_summary.json` contains `hashes.logHash` and `hashes.manifestHash` after tournament run
- `tournament_manifest.json` contains `truthBundleHash` after tournament run
- `truthBundleHash` is deterministic (same tournament → same hash)
- Files end with exactly one `\n`
- All existing tests still pass
```

---

## Prompt 4 — Phase 1.4: verify-match CLI

**Agent:** Codex
**Branch:** `phase-1.4/verify-match`
**Depends on:** Prompt 3 (hashes exist)
**Scope:** New CLI command

```
You are building a match verification CLI for HashMatch.

RULES:
- Do not rename or move existing files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- All changes on branch `phase-1.4/verify-match`.
- Definition of done: `npm test`, `npm run lint`, `npm run typecheck` pass. Include sample pass and fail outputs.
- Preserve all existing behavior.

## Context

The harness writes per-match directories containing:
- `match.jsonl` — truth log
- `match_manifest.json` — truth manifest
- `match_summary.json` — telemetry, includes `hashes: { logHash, manifestHash }`

Hashing utilities are in `src/core/hash.ts` (`hashFile`, `hashManifestCore`).

## Create `src/cli/verify-match.ts`

**Interface:**
```
npx tsx src/cli/verify-match.ts --path matches/round0-agentA-agentB/
```

`--path` must point to a single match directory containing the three required files. It does NOT accept tournament directories.

**Behavior:**

1. Check required files exist:
   - `match.jsonl`
   - `match_manifest.json`
   - `match_summary.json`
   If any missing, report which ones and exit code 2.

2. Read stored hashes from `match_summary.json` → `hashes.logHash` and `hashes.manifestHash`.
   If `hashes` field doesn't exist, report and exit code 2.

3. Recompute:
   - `logHash`: `await hashFile("match.jsonl")` — raw bytes on disk
   - `manifestHash`: parse `match_manifest.json` into an object, run `hashManifestCore()` on it

4. Compare recomputed to stored.

5. Structured results to **stdout**. Internal errors to **stderr**.

**Output — pass:**
```
verify-match: matches/round0-agentA-agentB/
  match.jsonl          ✓ exists
  match_manifest.json  ✓ exists
  match_summary.json   ✓ exists
  logHash              ✓ PASS (sha256:abc123...)
  manifestHash         ✓ PASS (sha256:def456...)
RESULT: PASS
```

**Output — fail:**
```
verify-match: matches/round0-agentA-agentB/
  match.jsonl          ✓ exists
  match_manifest.json  ✓ exists
  match_summary.json   ✓ exists
  logHash              ✗ FAIL
    expected: sha256:abc123...
    actual:   sha256:xyz789...
  manifestHash         ✓ PASS (sha256:def456...)
RESULT: FAIL
```

**Exit codes:**
- 0: all pass
- 1: hash mismatch
- 2: missing files, missing hashes field, or structural error

**Export verification logic as importable functions** (not just a CLI entry point) so that `verify-tournament` can reuse them without shelling out.

## Tests

- Run a match, verify-match → exit 0
- Append a byte to `match.jsonl` → exit 1, logHash FAIL
- Change a non-createdAt field in `match_manifest.json` → exit 1, manifestHash FAIL
- Change ONLY `createdAt` in `match_manifest.json` → exit 0 (createdAt excluded)
- Delete `match_manifest.json` → exit 2
- Remove `hashes` from `match_summary.json` → exit 2
- All existing tests still pass
```

---

## Prompt 5 — Phase 1.5: verify-tournament CLI

**Agent:** Codex
**Branch:** `phase-1.5/verify-tournament`
**Depends on:** Prompt 4 (verify-match exists)
**Can run in parallel with:** Prompt 6

```
You are building a tournament-level verification CLI for HashMatch.

RULES:
- Do not rename or move existing files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- All changes on branch `phase-1.5/verify-tournament`.
- Definition of done: `npm test`, `npm run lint`, `npm run typecheck` pass.
- Preserve all existing behavior.

## Context

- `src/cli/verify-match.ts` exports verification functions (not just CLI entry).
- Hashing utilities in `src/core/hash.ts`.
- The harness computes standings somewhere in `src/tournament/`.

## CRITICAL: Reuse existing standings logic

For standings recomputation, **import and reuse the existing standings computation module** from the tournament harness. Do NOT re-implement scoring or tie-break logic.

If the standings computation is currently inline in the tournament runner and not extractable as a standalone function, FIRST extract it into a reusable module (e.g., `src/tournament/computeStandings.ts`), then import it in both the runner and the verifier. The verifier and harness must use the exact same code path for scoring.

## Create `src/cli/verify-tournament.ts`

**Interface:**
```
npx tsx src/cli/verify-tournament.ts --path tournament_run/
```

**Behavior:**

1. **Structure check:**
   - `tournament_manifest.json` (required)
   - `standings.json` (required)
   - `matches/` directory with at least one match subdirectory
   Missing → exit 2.

2. **Per-match verification:** For each match directory under `matches/`, call the imported verify-match functions directly. Do NOT shell out.

3. **Standings recomputation:**
   - Read match outcomes from each `match_summary.json`
   - Read scoring model from `tournament_manifest.json`
   - Recompute standings using the **imported standings module**
   - Compare to published `standings.json`
   - PASS if identical, FAIL if different

4. **truthBundleHash check (if present):**
   - If `tournament_manifest.json` contains `truthBundleHash`, recompute (sorted logHash concatenation → SHA-256) and compare

**Output (stdout):**
```
verify-tournament: tournament_run/
  tournament_manifest.json  ✓ exists
  standings.json            ✓ exists
  matches: 6 found

  match round0-agentA-agentB  ✓ PASS
  match round0-agentA-agentC  ✓ PASS
  match round0-agentB-agentC  ✓ PASS
  match round1-agentA-agentB  ✓ PASS
  match round1-agentA-agentC  ✓ PASS
  match round1-agentB-agentC  ✓ PASS

  standings recomputation     ✓ PASS
  truthBundleHash             ✓ PASS

RESULT: PASS (6/6 matches, standings confirmed)
```

**Exit codes:** 0 = all pass, 1 = any failure, 2 = structural error

## Tests

- Full tournament → verify-tournament → PASS
- Tamper with one match's `match.jsonl` → that match FAIL, overall FAIL
- Tamper with `standings.json` → standings recomputation FAIL
- Delete a match directory → structural error (exit 2)
- All existing tests still pass
```

---

## Prompt 6 — Phase 2: Scenario #2 (Resource Rivals)

**Agent:** Codex
**Branch:** `phase-2/resource-rivals`
**Depends on:** Prompt 2 (manifests exist). **Can run in PARALLEL with Prompts 4–5.**
**Scope:** New scenario, new agents, validation

```
You are building a second scenario for HashMatch. The first scenario (NumberGuess) is at `src/scenarios/numberGuess/index.ts`.

RULES:
- Do not rename or move existing files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- All changes on branch `phase-2/resource-rivals`.
- Definition of done: `npm test`, `npm run lint`, `npm run typecheck` pass. Include sample tournament output.
- Preserve all existing behavior. NumberGuess must remain unaffected.

## Why this scenario matters

This is a verification test vector, not just content. It exercises:
- Private observations (hidden info) to test the viewer's redaction pipeline
- End-of-match reveal of hidden state
- Score swings and reversals for moment detection
- The `valid` field on `ActionAdjudicated` for blunder detection

## Scenario: Resource Rivals

A resource-management bidding game with hidden information.

**Setup:**
- Two agents start with equal resources (e.g., 100 points each)
- 10–15 contested objectives, presented one at a time
- Each objective has a publicly known value (5–20 points, generated by seeded RNG)
- At least one "jackpot" objective worth significantly more than average

**Per turn:**
- Both agents see: objective value, objectives remaining, their OWN captured score (public)
- Both agents see: their OWN remaining resources (PRIVATE — this is the hidden info)
- Each agent submits a bid (integer, 0 to remaining resources)
- Higher bid wins the objective's value
- Both agents lose their bid regardless
- Tie bid: agent with more remaining resources wins; if still tied, agent whose `agentId` is lexicographically first
- Invalid actions (bid < 0, bid > remaining, non-integer): penalized as bid = 0

**Terminal condition:**
- All objectives resolved, or both agents depleted
- Winner: highest captured objective value
- If tied: agent with more remaining resources; if still tied: agent whose `agentId` is lexicographically first

**Events:**

Use EXISTING event types wherever possible. Only introduce new types if the existing ones cannot carry the data, and namespace them clearly (e.g., `ResourceRivals.CustomEvent`).

| Event | Key Fields |
|-------|------------|
| `ObservationEmitted` | `remainingResources` as PRIVATE field. Follow whatever pattern `src/lib/replay/redaction.ts` uses to mark fields as private. |
| `ActionSubmitted` | Logs that action was submitted. Does NOT reveal the bid value. |
| `ActionAdjudicated` | Reveals BOTH bids simultaneously, the winner, the objective value, AND includes `valid: boolean` (and optional `reason: string`) for each agent's action. This field is essential for downstream blunder detection. |
| `StateUpdated` | Public scores (captured totals), objectives remaining |
| `MatchEnded` | `details` via `Scenario.reveal()`: final resources for both agents, complete bid history |

IMPORTANT: Bids are revealed only in `ActionAdjudicated`, NOT in `ActionSubmitted`. This prevents asymmetric reveal ordering in the log.

IMPORTANT: `ActionAdjudicated` MUST include `valid: boolean` per agent. This is a deterministic signal that downstream tooling (moment detection, verification) depends on.

## Implementation

### Scenario: `src/scenarios/resourceRivals/index.ts`

Study NumberGuess and follow the same contract/interface:
- Constructor takes seeded RNG from `src/core/rng.ts`
- ALL randomness via provided RNG — no `Math.random()`, no `Date.now()`
- `Scenario.reveal()` returns hidden state for `MatchEnded.details`
- Invalid actions caught deterministically
- Follow whatever scenario registration/discovery pattern NumberGuess uses

### Agents: `src/agents/resourceRivals/`

1. **randomBidder**: random fraction of remaining resources (via seeded RNG)
2. **conservativeAgent**: bids proportional to objective value relative to remaining objectives, conserves for late-game

### CLI integration

Must work with:
```
npx tsx src/cli/run-match.ts --scenario resourceRivals ...
npx tsx src/cli/run-tournament.ts --scenario resourceRivals --agents ./src/agents/resourceRivals --seed 42
```

## Validation checklist

- [ ] Tournament produces all artifacts: match.jsonl, match_manifest.json, match_summary.json, tournament_manifest.json, standings.json
- [ ] `match.jsonl` contains private observations that differ per agent
- [ ] `ActionAdjudicated` events include `valid: boolean` for each agent
- [ ] `MatchEnded` contains `details` with revealed hidden state
- [ ] Load a match in web replay viewer:
  - [ ] Spectator mode: `remainingResources` redacted
  - [ ] Post-match mode: visible
  - [ ] Director mode: everything visible
  - [ ] Spoiler toggle works
- [ ] verify-match passes on generated matches (if available)
- [ ] Some matches produce interesting turns (close bids, swings)
- [ ] All existing tests pass (NumberGuess unaffected)
```

---

## Prompt 7 — Phase 3: Moment Detection Upgrade

**Agent:** Codex
**Branch:** `phase-3/moment-heuristics`
**Depends on:** Prompt 6 (Scenario #2 exists)
**Scope:** Upgrade detection library, harness + viewer integration

```
You are upgrading the moment detection system for HashMatch.

RULES:
- Do not rename or move existing files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- All changes on branch `phase-3/moment-heuristics`.
- Definition of done: `npm test`, `npm run lint`, `npm run typecheck` pass.
- Preserve all existing behavior.

## Context

- `src/lib/replay/detectMoments.ts` — current implementation, turn boundaries only
- `src/app/replay/page.tsx` — web viewer, loads and displays moments
- ResourceRivals scenario emits `ActionAdjudicated` events with `valid: boolean`

## Task 1: Implement heuristic detectors

Upgrade `detectMoments.ts`. Each detector is a pure function: `(events: MatchEvent[]) => Moment[]`.

**Score Swing:** Score delta exceeds threshold within sliding window. Default: configurable, start at 15% of max possible score.

**Lead Change:** Leading agent changes between consecutive `StateUpdated` events.

**Comeback:** Agent behind by >X at some point, finishes ahead.

**Blunder:** Detect via `valid: false` on `ActionAdjudicated` events. Also detect `AgentError` events if they exist. If neither field exists in the actual schema, stop and report the mismatch. Extra weight if blunder occurs when agent was ahead.

**Clutch / Last-Turn Win:** Outcome decided in final 10% of turns.

**Close Call:** Score difference below threshold near end or at high-value event.

### Moment shape:

```typescript
interface Moment {
  id: string;
  label: string;
  type: string;      // "score_swing", "lead_change", "comeback", "blunder", "clutch", "close_call"
  startSeq: number;
  endSeq: number;
  signals: Record<string, unknown>;
  description?: string;
}
```

Main `detectMoments()` runs all detectors, merges, deduplicates overlapping (prefer higher impact). Thresholds configurable with sensible defaults. Deterministic output.

## Task 2: Harness integration

In `src/tournament/artifacts.ts`, after match completes:
- Run `detectMoments()` on parsed events
- If moments detected, write `moments.json` in match directory
- Telemetry-layer artifact

## Task 3: Viewer integration

In web viewer:
- If `moments.json` loaded from bundle, use it (published telemetry takes precedence)
- Otherwise compute on-the-fly via `detectMoments()`
- Display in timeline (check existing moment rendering and adapt)

## Tests

- Synthetic log with score swing → detected
- Log with `valid: false` → "Blunder" detected
- Log with lead change → detected
- Last-turn decider → "Clutch" detected
- Determinism: same input → same output
- Run on ResourceRivals matches → at least some moments found
- All existing tests pass
```

---

## Prompt 8 — Doc Reconciliation

**Agent:** Claude Code
**Branch:** `phase-4/doc-reconciliation`
**Depends on:** All of Prompts 1–7 complete
**Scope:** Documentation only — no code changes

```
You are doing a final reconciliation pass on all 12 design documents for HashMatch.

RULES:
- Do not rename or move files unless explicitly instructed.
- If the repo structure differs from what this prompt assumes, stop and report the mismatch.
- Make NO code changes — documentation only.
- Do NOT change any normative rules or design decisions.
- If docs disagree with code on a design rule, mark as 🟨 and note the discrepancy rather than rewriting the rule.
- All changes on branch `phase-4/doc-reconciliation`.

## What has been implemented

- Decision locks recorded (filenames, scoring, hashing, moments)
- match_manifest.json and tournament_manifest.json with dual-write
- SHA-256 hashing (logHash, manifestHash, truthBundleHash)
- verify-match and verify-tournament CLIs
- ResourceRivals scenario with hidden info + valid:boolean in ActionAdjudicated
- Moment detection with heuristic detectors (score swing, blunder, lead change, clutch, comeback, close call)
- Harness optionally writes moments.json

## Update these documents

1. `Documents/roadmap.md` — "Current Status":
   - Milestone 1 gaps resolved (manifests, scoring, filenames)
   - Milestone 2 moments upgraded
   - Milestone 3 partial → mostly done (manifests, hashing, verification)
   - Milestone 4 partial (verify CLIs exist, no receipts)
   - Scenario library: add ResourceRivals

2. `Documents/tournament_harness_v0.md` §14:
   - Update "Differences from this spec" table

3. `Documents/integrity_and_verification.md` §12:
   - Phase A: manifests + hashing implemented
   - Phase B: verification CLI exists, no receipts

4. `Documents/replay_and_broadcast.md`:
   - Moment detection upgraded
   - ResourceRivals exercises redaction/spoiler pipeline

5. All other documents: scan for stale status notes

## Rules

- Emoji: ✅ done, 🟨 partial, ⬜ not started
- Conservative: only update what actually changed
- No remaining references to `tournament.json` as canonical (except dual-write note)
- No remaining references to win=1/loss=0
- `tieBreakers` uses `"totalPointsScored"` consistently

Commit message: "Reconcile docs with implementation: trust foundation + scenario #2 + moments"
```

---

## Execution Summary

| Order | Prompt | Agent | Branch | Depends On | Parallel? |
|-------|--------|-------|--------|------------|-----------|
| 1 | Decision Locks | Claude Code | `phase-0/decision-locks` | — | — |
| 2 | Manifests | Codex | `phase-1.1/match-manifests` | #1 | — |
| 3 | Hashing | Codex | `phase-1.3/hashing` | #2 | — |
| 4 | verify-match | Codex | `phase-1.4/verify-match` | #3 | — |
| 5 | verify-tournament | Codex | `phase-1.5/verify-tournament` | #4 | ✅ parallel with #6 |
| 6 | Scenario #2 | Codex | `phase-2/resource-rivals` | #2 | ✅ parallel with #4–5 |
| 7 | Moments Upgrade | Codex | `phase-3/moment-heuristics` | #6 | — |
| 8 | Doc Reconciliation | Claude Code | `phase-4/doc-reconciliation` | all above | — |

**Critical path:** 1 → 2 → 3 → 4 (sequential, each depends on the last)
**Parallel track:** 6 starts after 2, runs alongside 3–5
**Final pass:** 8 runs after everything else lands
