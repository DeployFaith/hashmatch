# Recon: LLM Terminology Alignment & "Real LLM Everywhere" Policy

**Date:** 2026-02-09
**Scope:** Comment-only audit — no code changes, no renames, no behavior changes.

**Status:** Categories (A) and (C) applied. See PR referencing #125.

---

## 1. Terminology Drift: "Red Team" / "Fixture Agent"

### Files containing "redteam" / "red-team" / "red team"

| File                                          | What                                                   | Category            | Status                                                        |
| --------------------------------------------- | ------------------------------------------------------ | ------------------- | ------------------------------------------------------------- |
| `tests/redteam-fixtures.test.ts`              | Filename, describe block, tmp-dir prefix               | **(A)** rename only | **Done** → `tests/degenerate-behavior.test.ts`                |
| `tests/fixtures/agents/heistFixtureAgents.ts` | Imported as "fixture agents" by the above              | **(A)** rename only | **Done** → `tests/fixtures/agents/heistDegenerateProfiles.ts` |
| `Research/agent_failure_taxonomy.md`          | 17× "Red-Team Tests" section headers + intro paragraph | **(A)** rename only | **Done** → "Failure-Mode Regression Tests"                    |

### Files using "fixture" to mean "scripted agent"

| File                                               | What                                               | Category               | Status   |
| -------------------------------------------------- | -------------------------------------------------- | ---------------------- | -------- |
| `tests/fixtures/agents/heistDegenerateProfiles.ts` | 8 exported factory functions renamed to `*Profile` | **(A)** rename symbols | **Done** |
| `tests/degenerate-behavior.test.ts`                | Imports updated to `*Profile` names                | **(A)** rename imports | **Done** |

### Files using "fixture" to mean "static test data" (standard, no change needed)

| File                                                  | What                                |
| ----------------------------------------------------- | ----------------------------------- |
| `tests/fixtures/heist/README.md`                      | Golden JSONL snapshot               |
| `tests/fixtures/heist/*.jsonl`, `*.json`              | Test data files                     |
| `tests/redaction-integration.test.ts`                 | Loads JSONL fixtures                |
| `tests/heistRoomLayout.test.ts`                       | Loads JSONL fixture                 |
| `tests/heistSceneReducer.test.ts`                     | Loads JSONL fixture                 |
| `tests/heistSpectatorTelemetry.test.ts`               | Loads JSONL fixture                 |
| `tests/redaction-audit/`                              | Fixture generator + test data       |
| `tests/commentary.test.ts`                            | Inline test data labeled "Fixtures" |
| `tests/redaction.test.ts`                             | Inline test data labeled "Fixtures" |
| `src/lib/replay/fixtures/sampleNumberGuess.ts`        | Static UI sample data               |
| `src/lib/replay/fixtures/sampleMatchSummaryWithFm.ts` | Static UI sample data               |

---

## 2. Policy Drift: Scripted Agents vs "All Agents Are Real LLM Calls"

### Scripted agents (no provider/model config)

| Agent                              | File                                               | Used By                                                                                       | Category                                   |
| ---------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `createRandomAgent`                | `src/agents/randomAgent.ts`                        | contract.test, gateway-runner.test, jsonl-determinism.test, run-demo CLI, tournament registry | **(B)** or **(C)** — open decision         |
| `createBaselineAgent`              | `src/agents/baselineAgent.ts`                      | same as above                                                                                 | **(B)** or **(C)**                         |
| `createNoopAgent`                  | `src/agents/noopAgent.ts`                          | agent-compat.test, tournament registry, fixture generation                                    | **(C)** keep deterministic                 |
| `createRandomBidderAgent`          | `src/agents/resourceRivals/randomBidder.ts`        | resourceRivals.test, agent-compat.test, tournament registry                                   | **(B)** or **(C)**                         |
| `createConservativeAgent`          | `src/agents/resourceRivals/conservativeAgent.ts`   | same as above                                                                                 | **(B)** or **(C)**                         |
| `createWaitSpamProfile`            | `tests/fixtures/agents/heistDegenerateProfiles.ts` | degenerate-behavior.test only                                                                 | **(C)** classifier regression — **tagged** |
| `createInvalidActionProfile`       | same                                               | same                                                                                          | **(C)** classifier regression — **tagged** |
| `createActionSpaceCyclerProfile`   | same                                               | same                                                                                          | **(C)** classifier regression — **tagged** |
| `createFormatViolationProfile`     | same                                               | same                                                                                          | **(C)** classifier regression — **tagged** |
| `createOutputBloatProfile`         | same                                               | same                                                                                          | **(C)** classifier regression — **tagged** |
| `createRepeatMalformedProfile`     | same                                               | same                                                                                          | **(C)** classifier regression — **tagged** |
| `createCompositeDegenerateProfile` | same                                               | same                                                                                          | **(C)** classifier regression — **tagged** |
| `createCleanBaselineProfile`       | same                                               | same                                                                                          | **(C)** classifier regression — **tagged** |

### Where tests assume deterministic scripted behavior

- `tests/degenerate-behavior.test.ts` — all 8 test cases assert exact FM-classifier
  output from deterministic profiles. These are classifier regression tests and
  MUST remain deterministic.
- `tests/contract.test.ts` — uses `createRandomAgent` + `createBaselineAgent` for
  basic contract validation.
- `tests/gateway-runner.test.ts` — same pair for gateway integration.
- `tests/jsonl-determinism.test.ts` — asserts byte-identical JSONL from two runs
  with the same seed. Fundamentally requires deterministic agents.
- `tests/timeout-enforcement.test.ts` — uses custom scripted `createTimeoutAgent`
  and `createConstantAgent` to test timeout logic. Must stay deterministic.
- `tests/heist-competitive-runner.test.ts` — uses custom scripted `createWaitAgent`
  and `createInvalidMoveAgent`. Must stay deterministic.
- `tests/resourceRivals.test.ts` — uses `createRandomBidderAgent` +
  `createConservativeAgent` for scenario validation.
- `tests/agent-compat.test.ts` — exercises all 5 built-in agents for interface
  compatibility.

### Manifest / provenance fields assuming fixture category

- `src/lib/matches/types.ts:84` — `AgentProfileType = "scripted" | "llm" | "http"`
  does not distinguish classifier-regression fixtures from strategy baselines.
- `src/app/api/matches/[matchId]/route.ts:54` — `resolveAgentTypeFromMetadata()`
  returns `undefined` when no metadata is present (all built-in scripted agents).
- `src/tournament/runTournament.ts:52` — `agentRegistry` has no provenance
  descriptors for the 5 built-in scripted agents, so manifests lack `agentType`.
- `src/components/AgentCard.tsx` — UI labels only cover `scripted | llm | http`.

---

## 3. Suggested Renames (all completed)

| Current                                       | Target                                                    | Category | Status                    |
| --------------------------------------------- | --------------------------------------------------------- | -------- | ------------------------- |
| `tests/redteam-fixtures.test.ts`              | `tests/degenerate-behavior.test.ts`                       | **(A)**  | **Done**                  |
| `tests/fixtures/agents/heistFixtureAgents.ts` | `tests/fixtures/agents/heistDegenerateProfiles.ts`        | **(A)**  | **Done**                  |
| `createFormatHackerAgent`                     | `createFormatViolationProfile`                            | **(A)**  | **Done**                  |
| `createWaitSpamAgent`                         | `createWaitSpamProfile`                                   | **(A)**  | **Done**                  |
| Other `create*Agent` in fixtures              | `create*Profile`                                          | **(A)**  | **Done**                  |
| Describe: "Red-team fixture agents"           | "Degenerate behavior profiles (FM classifier regression)" | **(A)**  | **Done**                  |
| Research doc: "Red-Team Tests" ×17            | "Failure-Mode Regression Tests"                           | **(A)**  | **Done**                  |
| `m_fixture_fm_001`                            | `m_sample_fm_001`                                         | **(A)**  | deferred (UI sample data) |

---

## 4. Minimum-Change Path

The fastest way to reconcile the "all agents are real LLM calls" policy with
the existing FM classifier regression coverage is a **three-layer approach**:

1. **Rename only (A):** ~~Rename files, symbols, describe blocks, and doc headers
   from "red team" / "fixture agent" to "degenerate behavior profile" /
   "FM classifier regression."~~ **Done** — landed in terminology cleanup PR.

2. **Explicitly tag scripted agents (C):** ~~Add `purpose: "test"` and
   `agentType: "scripted"` to the provenance metadata of every built-in agent
   registration in `runTournament.ts`.~~ **Done** — all five built-in agents
   now carry `purpose: "test"` metadata. Publish pipeline can reject them.

3. **Migrate strategy baselines to LLM (B):** As a follow-up, create
   `createLlmRandomAgent` / `createLlmBaselineAgent` wrappers that call
   the LLM provider gateway with system prompts mimicking the current
   strategies. The existing scripted versions remain as regression baselines
   (category C). Tests that require determinism continue using the scripted
   versions; tests that exercise the "real LLM" path use the new wrappers
   with mocked or live inference. **Deferred** to provider gateway follow-up.

This preserves all FM classifier regression coverage, satisfies the policy
direction, and avoids a big-bang rewrite.

---

## 5. Open Decisions

- Should `AgentProfileType` gain sub-categories (e.g. `"scripted:regression"` vs
  `"scripted:baseline"`) or should this be a separate metadata field?
- Should the tournament runner refuse to schedule scripted-vs-scripted matches in
  production modes, or only flag them in the manifest?
- For category (B) agents: mock LLM in CI tests or require a real Ollama
  instance? (Currently `ollama-agent.test.ts` requires a running Ollama server.)
