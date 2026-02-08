# Research Convergence: PCG, Integrity, Watchability, and Threat Model

**Date:** 2026-02-07
**Contributors:** Claude (independent research), GPT (initial research + comparative analysis)
**Status:** Converged findings — ready for spec integration

---

## Purpose

Two independent research efforts investigated procedural content generation, cryptographic integrity, watchability metrics, threat modeling, and esports integrity for HashMatch. This document records the **converged conclusions**, flags remaining open questions, and proposes concrete spec changes.

GPT's comparative analysis was largely fair and accurate. This document accepts GPT's corrections where warranted, pushes back where needed, and resolves ambiguities into decisions.

---

## 1. PCG Pipeline Architecture

### Converged Decision

The four-stage pipeline is validated by both academic literature and every competitive AI platform examined:

```
structure → fill → validate → score/select
```

**This is not aspirational — HashMatch already implements a primitive version of this in the Heist generator.** The work ahead is formalizing, generalizing, and instrumenting it.

### Specific Agreements

| Topic                                      | Decision                                                                | Confidence | Source                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| Pipeline shape                             | structure → fill → validate → score/select                              | High       | Rupp et al. 2025, Halite, Lux AI, Battlecode                            |
| Symmetry as primary fairness mechanism     | Required for all competitive maps                                       | High       | Every competitive AI platform uses it                                   |
| WFC role                                   | **Fill step only** — local tile coherence within pre-structured regions | High       | No competitive platform uses WFC for structure; lacks global properties |
| BSP / grammar / evolutionary for structure | Correct algorithm families for the structure stage                      | High       | Industry standard                                                       |
| Simulation-based balance validation        | Generate → simulate → reject unbalanced candidates                      | High       | Rupp et al. 2025 (68% balanced via PCGRL + swap)                        |

### WFC Correction (Accepted)

GPT's original report suggested WFC as a structure-stage candidate. Claude's correction is well-sourced: WFC enforces only local adjacency constraints and has zero concept of fairness, symmetry, or player balance. No published paper or competitive platform uses WFC for competitive maps. All WFC applications (Bad North, Townscaper, Caves of Qud) are aesthetic or single-player.

**Resolution:** WFC is explicitly excluded from the structure stage. It may be used in the fill step for generating locally coherent tile arrangements within strategically pre-determined regions.

### PAIRED Reclassification (Accepted)

GPT positioned PAIRED as a possible approach for adversarial environment generation. Claude correctly identified that PAIRED has never been deployed in production, suffers from documented failure modes (mode collapse, fall-behind problem), and has been superseded by more practical approaches.

**Resolution:**

- PAIRED → "historically influential, not deployable" category
- PLR⊥ (NeurIPS 2021) → theoretically principled, proven convergence to minimax regret
- ACCEL (2022) → practical state-of-the-art, single-GPU, combines evolution with regret curation
- MAESTRO (2023) → most relevant for HashMatch (extends UED to multi-agent competitive settings)

**For V1:** None of these are needed. Hand-authored scenarios with procedural variation (which HashMatch already does) are sufficient. UED techniques become relevant when the scenario library grows large enough to warrant automated generation and curation.

---

## 2. Cryptographic Seed Integrity

### Converged Decision

HMAC-SHA256 commit-reveal is cryptographically sound and production-validated by gambling platforms (Stake.com, PrimeDice, BGaming). **HashMatch implementing this for competitive AI would be genuinely novel — no AI competition platform has done it.**

### Protocol Specification

```
// Pre-match (commit phase)
serverSeed = crypto.randomBytes(32)
commit = SHA256(serverSeed)
publish(commit)

// Match start (reveal phase)
reveal(serverSeed)
combinedInput = serverSeed || matchId || tournamentSeed
gameSeed = SHA256(combinedInput)

// Post-match (verification)
assert(SHA256(revealedServerSeed) === publishedCommit)
```

### Threat Model Additions (from Claude's report)

GPT's original report did not enumerate specific attack vectors. Claude surfaced four concrete threats that must be addressed:

| Attack                      | Description                                                                        | Mitigation                                                         | Priority                           |
| --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| **Seed selection**          | Operator pre-computes many seeds, picks favorable one                              | Incorporate external entropy (drand beacon value)                  | High                               |
| **Selective abort**         | Operator refuses to reveal when outcome is unfavorable                             | Enforce reveal deadlines; default to forfeit or fallback seed      | High                               |
| **Last revealer advantage** | In multi-party schemes, last revealer can compute result before deciding to reveal | Use VDFs or fixed reveal order; or single-party + external entropy | Medium                             |
| **Hash copying**            | Participant submits copy of another's commitment hash                              | Bind commitments to identity (include participantId in hash input) | Low (unlikely in our architecture) |

### External Entropy Sources

| Source                        | Latency    | Trust Model                                                            | Practical?                             |
| ----------------------------- | ---------- | ---------------------------------------------------------------------- | -------------------------------------- |
| **drand (League of Entropy)** | 30s rounds | 24+ independent organizations, BLS threshold signatures                | Yes — recommended                      |
| **NIST Randomness Beacon**    | 60s rounds | Centralized (NIST), quantum RNG                                        | Backup option                          |
| **Chainlink VRF**             | ~2s        | On-chain proof verification, GLI-19 certified                          | Yes — if on-chain verification desired |
| **Bitcoin block hash**        | ~10 min    | Decentralized but slow, manipulable by miners with sufficient hashrate | Not recommended                        |

**Recommendation for V1:** HMAC-SHA256 with server seed + matchId. Record the derivation inputs in `match_manifest.json` (which already has fields for this). External entropy (drand) is a Phase C enhancement — add it when sanctioned tournaments with real stakes begin.

### Disagreement: Urgency of External Entropy

GPT's convergence plan lists external entropy as a high-priority convergence item. I disagree on timing. For V1 sandbox and early exhibition play, the organizer (Kyle) is trusted. Seed selection attacks require a malicious organizer — which is not the current threat model. External entropy becomes critical only when:

- Third-party organizers run tournaments
- Prize money is involved
- The organizer's neutrality could reasonably be questioned

**Resolution:** Document the full protocol including external entropy in the spec. Implement the simple version (server seed + commit-reveal) first. Gate external entropy on the "sanctioned mode with third-party organizers" milestone.

---

## 3. Validation and Watchability Metrics

### ValidationReport Schema (Converged)

Both reports agree this should be formalized. Current Heist validator does pass/fail with BFS reachability checks. The upgrade path is adding typed metrics:

```typescript
interface ValidationReport {
  // Hard requirements (fail = reject scenario)
  solvable: boolean;

  // Quantitative metrics
  minSolutionDepth: number; // shortest winning path
  maxSolutionDepth: number; // longest reasonable path
  branchingFactor: number; // average meaningful choices per turn
  symmetryScore: number; // 0.0–1.0, how balanced starting positions are

  // Anti-precomputation
  noveltyScore: number; // distance from previously used scenarios
  distinctPathCount: number; // approximate number of meaningfully different strategies

  // Metadata
  validatedAt: string; // ISO timestamp
  validatorVersion: string;
  computeTimeMs: number;
}
```

**Key addition from research:** `symmetryScore` is validated by every competitive AI platform (Halite, Lux AI, Battlecode all enforce symmetry as a hard constraint). This should be a first-class metric, not optional.

### WatchabilityScoreReport Schema (Converged)

Both reports agree on the metrics. Claude's contribution is grounding them in specific academic frameworks:

```typescript
interface WatchabilityScoreReport {
  // Vecer-Ichiba-Laudanovic metric: Σ|ΔWP| (total variation of win probability)
  // This is the Game Excitement Index (GEI) used by FiveThirtyEight, Yale YUSAG
  expectedSwings: number; // predicted lead changes
  maxSwingMagnitude: number; // largest possible single-turn WP shift (0.0–1.0)

  // Clutch / brink analysis
  brinkMomentCount: number; // predicted near-terminal situations
  comebackPotential: number; // P(recovery | trailing badly) (0.0–1.0)

  // Punish window analysis (from fighting game frame data concept)
  punishWindows: {
    expectedCount: number;
    avgDurationTurns: number;
    severity: "low" | "moderate" | "high"; // how much a punish swings the game
  };

  // Interaction density
  interactionRate: number; // expected opponent-affecting actions per turn
  interactionVariety: "uniform" | "mixed" | "clustered";

  // Iida's Game Refinement Theory: GR = √(G/T)
  // Target: GR ≈ 0.07–0.08 for well-designed competitive games
  gameRefinementValue: number;

  // Composite
  overallScore: number; // 0.0–10.0 weighted composite
}
```

**Academic grounding:**

| Metric          | Academic Source                                             | Validated On                                  |
| --------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Swings / GEI    | Vecer, Ichiba, Laudanovic (2007, JQAS)                      | FIFA World Cup 2006 via Betfair data          |
| GEI formula     | FiveThirtyEight (Beuoy); Yale YUSAG                         | 13 seasons NBA play-by-play; NFL via nflfastR |
| Brink / clutch  | Sarlis et al. (2024, MLKE); Schweickle et al. (2021, IRSEP) | 20 seasons NBA; systematic review             |
| Game Refinement | Iida et al. (2003–present, JAIST)                           | Chess, Go, soccer, boxing, DotA, StarCraft II |
| Punish windows  | Fighting game community (frame data)                        | Street Fighter, Tekken, Guilty Gear           |

**For V1:** Implement ValidationReport first (it gates scenario quality). WatchabilityScoreReport is a Phase 2 enhancement — it requires either simulation infrastructure or structural heuristics that don't exist yet.

---

## 4. Floating-Point Determinism

### Status: New Issue (from Claude's report)

GPT's original report did not address this. Claude flagged it as a critical replay verification risk, and GPT accepted the correction in the convergence analysis.

### The Problem

IEEE 754 floating-point arithmetic is deterministic on a given platform, but produces subtly different results across:

- Different compilers (MSVC vs. GCC vs. Clang)
- Different architectures (Intel vs. AMD vs. ARM)
- Different optimization levels (-O0 vs. -O2)
- Extended precision modes (x87 80-bit vs. SSE 64-bit)

This means a match replayed on different hardware can produce a different `logHash`, silently breaking verification.

### HashMatch's Current Position

**This is mostly a non-issue for HashMatch V1.** Here's why:

1. **The engine uses integer arithmetic for game logic.** Heist uses discrete room graphs, integer turn counts, integer scoring. ResourceRivals uses integer bids and scores. NumberGuess uses integer comparisons.
2. **The server-authoritative architecture means matches run on controlled infrastructure.** There's no cross-platform simulation requirement.
3. **TypeScript/Node.js provides consistent IEEE 754 double precision.** V8's JIT compilation is deterministic for the same code on the same platform version.

### When It Becomes a Risk

- If a future scenario uses continuous physics or spatial reasoning with floating-point math
- If verification needs to work across different Node.js versions or platforms
- If community forks run scenarios on different hardware

### Resolution

**For V1:** Document the constraint: "All game logic must use integer arithmetic. Floating-point is permitted only for non-deterministic-critical computations (display, telemetry aggregation, watchability scoring)." This is already effectively true — make it explicit.

**For future scenarios with continuous math:** Use fixed-point arithmetic (Q16.16 integer format with lookup tables for trig) or constrain to single-build verification.

---

## 5. Spectator Systems as Attack Surfaces

### Converged Decision (Strong Agreement)

The CS:GO coaching bug scandal is the most relevant integrity precedent. Key facts:

- The bug existed for **4 years** before discovery (2016–2020)
- Multiple variants: static camera, third-person follow, free-roam
- ESIC reviewed **99,650 demos**, sanctioned **~100 coaches**
- Even after Valve's "fix," the bug could be recreated

The Azubu Frost incident (2012 LoL Worlds) further demonstrates that even physical stage layout can leak information.

### Architectural Principle

> **Spectator and observer systems must be architecturally constrained, not just policy-restricted.**

"Don't show them forbidden information" is not sufficient. The system must be designed so that forbidden information **cannot flow** to spectator-facing interfaces, even if bugs exist in the viewer code.

### What HashMatch Already Has

- `_private` field-level redaction convention
- Mode-dependent visibility policies (spectator/postMatch/director)
- Server-side redaction gates (patched in PR #49 redaction audit)
- Three-plane architecture (Control/Match/Broadcast) with explicit separation

### What's Missing

| Gap                               | Description                                                                                    | Priority                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `spectatorDelayMs` enforcement    | Mode profiles define it but no enforcement logic exists                                        | High — add to mode profile enforcement            |
| Redaction integration tests       | Scenario-specific tests that assert `_private` fields never appear in spectator-facing outputs | High — add to test suite                          |
| Coaching channel bandwidth limits | Advisory mode exists in schema but no rate limiting or vocabulary constraints                  | Medium — defer until coaching mode is implemented |
| Observer mode audit trail         | Log when spectator views are accessed and what data they received                              | Low — operational concern                         |

---

## 6. Anti-Precomputation and Environment Design

### Converged Strategies

Both reports agree on the core approaches. Ordered by implementation effort:

| Strategy                                      | Effort    | Impact | Status                                                                       |
| --------------------------------------------- | --------- | ------ | ---------------------------------------------------------------------------- |
| **Never reuse exact scenarios**               | Trivial   | High   | Already true — seeds differ per match                                        |
| **Symmetry enforcement**                      | Low       | High   | Partially implemented (Heist has some symmetry)                              |
| **Hidden evaluation maps** (microRTS pattern) | Low       | High   | Not implemented — add to tournament harness                                  |
| **Large scenario parameter space**            | Medium    | High   | Heist has parameterized generation; needs expansion                          |
| **Compute budgets per agent**                 | Medium    | High   | Not implemented — Battlecode uses bytecode limits; microRTS uses 100ms/cycle |
| **Simulation-based balance filtering**        | High      | Medium | Not implemented — requires dummy agents + rollout infrastructure             |
| **UED (ACCEL/MAESTRO)**                       | Very high | Medium | Research-phase only — not for V1                                             |

### Hidden Map Sets

Claude surfaced the microRTS pattern of using **hidden maps revealed only during competition**. This is directly applicable:

**Proposal:** For sanctioned tournaments, generate scenario parameters from the committed seed at match time. Agents never see the specific scenario until the match begins. This is already how the architecture works in principle — make it an explicit, documented guarantee.

### Compute Fairness

Both Battlecode (bytecode budgets) and microRTS (millisecond time limits on the same machine) enforce compute fairness as a hard constraint. HashMatch's `resourceBudgets` field exists in the manifest schema but is not enforced.

**For V1:** Enforce `maxTurnTimeMs` per agent. Log and penalize (or forfeit) agents that exceed it. This is table-stakes for competitive integrity.

---

## 7. Cooperative Play (Human-Agent)

### Converged Position

Both reports agree this is exploratory and not blocking. GPT's four arbitration models (interrupt/override, veto, tokenized control, action partitioning) are reasonable frameworks. Claude's addition: don't try to "prove humanness" — instead, design coaching interfaces so that even an LLM routing through them gains no unfair strategic advantage.

### Resolution

- Schema slots (`copilot`, `piloted`) are already reserved in mode profiles
- No implementation work until the core competitive loop is solid
- When implemented, bias toward **action partitioning** as the default arbitration model
- Require all coaching inputs to be logged, timestamped, and included in the replay transcript

---

## 8. Open Questions (Not Yet Converged)

### 8.1 Watchability Scoring Computation Method

Two approaches exist:

- **Simulation-based:** Run N rollouts with dummy agents, measure actual swings/brink moments
- **Structural analysis:** Estimate from scenario topology without simulation

Simulation is more accurate but requires agent infrastructure. Structural analysis is cheaper but less reliable. **Decision deferred** until WatchabilityScoreReport implementation begins.

### 8.2 Candidate Pool Size for Scenario Selection

GPT's report suggested 100–500 candidates. Claude's research found ProcGen needs 500–1,000 unique levels for agent generalization. For pre-match generation (not training), a smaller pool (5–20 candidates) is likely sufficient — generate a handful, validate, pick the best.

**Decision deferred** until multi-candidate generation is implemented.

### 8.3 Game Refinement Theory Target Range

Iida's GR ≈ 0.07–0.08 "comfort zone" is validated across traditional games but has not been specifically tested on AI-vs-AI escape-room scenarios. The target range may need calibration against HashMatch's specific game types.

**Decision deferred** until enough match data exists to calibrate.

---

## 9. Implementation Priority (Sequenced)

### Immediate (Next Sprint Candidates)

1. **Document integer arithmetic constraint** — Add to scenario design guidelines: "All game logic must use integer arithmetic."
2. **Add symmetryScore to Heist validator** — Compute and report starting-position balance.
3. **Enforce maxTurnTimeMs** — Add timeout + forfeit logic to the tournament harness.

### Short-Term (Next 2–4 Sprints)

4. **Formalize ValidationReport schema** — TypeScript interface, emitted by all validators.
5. **Add spectatorDelayMs to mode profiles** — With enforcement in the broadcast plane.
6. **Redaction integration tests** — Per-scenario tests asserting no `_private` leakage.
7. **Seed integrity spec** — Document the commit-reveal protocol in `integrity_and_verification.md` §8.

### Medium-Term (When Sanctioned Tournaments Begin)

8. **Implement commit-reveal in tournament harness** — Server seed + commit + reveal + manifest recording.
9. **WatchabilityScoreReport schema** — Start with structural heuristics, add simulation later.
10. **Hidden map guarantee** — Explicit documentation + enforcement that agents never see scenarios pre-match.

### Long-Term (When Third-Party Organizers or Prizes Exist)

11. **External entropy integration (drand)** — Add to seed derivation.
12. **Signed receipts** — Organizer key management + signature verification.
13. **PCG fuzzer/regression harness** — Generate N scenarios, validate distribution bounds.
14. **UED exploration** — Evaluate ACCEL/MAESTRO for automated scenario curation.

---

## 10. Summary of Corrections Applied

| Original Claim (GPT)                                      | Correction (Claude)                                               | Resolution                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| WFC suitable for structure generation                     | WFC lacks global properties; no competitive platform uses it      | WFC → fill step only                            |
| PAIRED as viable UED approach                             | PAIRED has documented failure modes; never deployed in production | Reclassified; ACCEL/MAESTRO as future options   |
| Commit-reveal is established practice for AI competitions | Zero AI competition platforms use commit-reveal                   | Flagged as genuinely novel; still recommended   |
| (Not addressed) Floating-point determinism                | Cross-platform replay can silently fail                           | Documented; integer arithmetic constraint added |
| (Not addressed) Seed selection attack                     | Most insidious commit-reveal threat                               | Added to threat model with drand mitigation     |
| (Not addressed) Hidden evaluation maps                    | microRTS pattern prevents hard-coded strategies                   | Added as recommended practice                   |

---

_This document represents the converged output of both research efforts. It should be used as the reference for updating HashMatch's specification, security audit, and roadmap documents._
