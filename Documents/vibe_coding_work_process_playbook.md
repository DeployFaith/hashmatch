# HashMatch Work Process Playbook

This is the reusable workflow we used to build HashMatch with high quality, high trust, and fast iteration.

It’s written so future projects can follow the same “shape”:

- clear decisions first
- small, verifiable changes
- deterministic outputs
- strong review + convergence loops
- docs and code never drift

---

## 0) The Spirit of the System

HashMatch has a particular vibe: _watchable competition + provable truth_.

That vibe shaped our workflow:

- **Entertainment is mandatory** (spectator-first).
- **Trust is mandatory** (verifiable outputs).
- **Offline-first artifacts** (at minimum) so work is portable, testable, and inspectable.
- **No confident guessing**. When the repo differs from assumptions, we stop and report mismatch.

Even if a future project isn’t “UFC for Agents,” the workflow still applies: treat correctness and reproducibility as first-class citizens.

---

## 1) Team Roles (Human + AI)

### 1.1 Kyle (Human Orchestrator / Product Owner)

Kyle is the final authority.

- sets priorities and taste
- approves scope changes
- decides what ships
- merges PRs
- provides missing facts (especially infra/user/domain/ports)

Kyle’s preferences that affect the workflow:

- ask for the **current file contents** (or repo state) before proposing full-file changes
- avoid placeholders for infra or config; collect exact values
- avoid making infrastructure decisions (users/auth/permissions/domains/ports/deploy choices) without explicit approval

### 1.2 ChatGPT (Architect / Mentor / Process Controller)

ChatGPT’s job is to keep the whole machine coherent:

- translate vision into phased plans
- write “prompt packs” (clear, runnable work orders)
- enforce constraints (determinism, redaction, test gates)
- run adversarial review (find contradictions, edge cases, missing acceptance criteria)
- do convergence: turn many ideas into a single canonical decision

### 1.3 Claude Code (Docs + Frontend + Reconciliation)

Claude is strongest when the work is:

- editing and reconciling spec documents
- reasoning about UI/UX and user flows
- tightening narrative + spectator experience
- “doc reconciliation” passes to remove contradictions

### 1.4 Codex (Backend + CLI + Determinism + Tests)

Codex is strongest when the work is:

- TypeScript backend changes
- CLI tools, hashing, manifest writing
- deterministic algorithms and seed derivation
- test writing and fixes

### 1.5 The Hidden Fifth Member: The Reviewer

Every change needs an adversary.
Sometimes it’s Kyle.
Sometimes it’s ChatGPT.
Sometimes Claude reviews Codex work (or vice versa).

The key idea: **shipping without a critical pass is how bugs become folklore.**

---

## 2) The Core Loop (How Work Moves)

We use a repeating loop:

1. **Decide** (lock a rule)
2. **Specify** (update docs so there is one canonical truth)
3. **Implement** (small, scoped code change)
4. **Verify** (tests + sample outputs)
5. **Reconcile** (docs vs code drift check)
6. **Publish** (merge + tag + note)

This loop is intentionally boring. Boring is good. Boring scales.

---

## 3) Decision Locks (Stop the Bleeding First)

Before serious implementation, we perform “decision locks.”

A decision lock is:

- a specific question that has been answered inconsistently across code/docs
- rewritten into a single canonical answer
- propagated across all documents that mention it
- protected from regression

Examples of typical lock categories:

- canonical filenames
- scoring rules + tie-breakers
- byte-level hashing contract
- ownership rules for derived artifacts

Rule: **No new code ships while key contradictions remain in the specs.**

---

## 4) Prompt Packs (How We Delegate Work)

We don’t “ask an AI to do a thing.” We write executable work orders.

### 4.1 Why prompt packs

Prompt packs turn vague intent into:

- branch names
- scope boundaries
- definition of done
- explicit file lists
- explicit success criteria

They also allow parallel work without chaos.

### 4.2 Global rules every prompt includes

Every prompt includes rules like:

- do not rename/move files unless explicitly instructed
- stop and report mismatch if repo structure differs
- work on a named feature branch, not main
- preserve behavior unless explicitly changing it
- pass `lint`, `typecheck`, `test`
- don’t commit generated outputs

### 4.3 Prompt structure template

Use this template (copy/paste):

**Agent:** (Claude Code / Codex)
**Branch:** `phase-X.Y/short-slug`
**Depends on:** (what must land first)
**Scope:** (docs-only / code-only / both)

**Goal**

- one sentence goal

**Context**

- what exists today
- key files
- constraints (offline-only, determinism, redaction, etc.)

**Rules**

- global rules + any task-specific prohibitions

**Tasks**

1. …
2. …

**Acceptance criteria / Definition of Done**

- exact commands that must pass
- exact outputs that must exist
- exact UI behaviors that must be visible

**Non-goals**

- what not to do

**Deliverables**

- list of files changed
- sample output directory path
- PR description

### 4.4 Task splitting heuristic

- If it’s **docs reconciliation or UX narrative** → Claude
- If it’s **TypeScript engine/CLI/determinism/tests** → Codex
- If it’s **architecture, phased plan, integration edge cases** → ChatGPT

---

## 5) Parallelism Without Collisions

We run parallel work only when the integration surface is small.

Rules:

- each agent works on a **separate branch**
- branch names include the phase and feature
- each branch has a single, coherent purpose
- no shared “mega-branch” for unrelated work

Integration strategy:

- merge the branch that introduces shared types/utilities first
- rebase the other branches after
- if conflicts appear, resolve them in the smallest diff possible

---

## 6) Convergence Cycles (How We Reach One Answer)

We converge deliberately.

A convergence cycle looks like:

1. **Diverge**: generate options (design variants, file formats, UI patterns)
2. **Adversarial review**: try to break each option (edge cases, contradictions, security)
3. **Lock**: pick one option and write it into specs as canonical
4. **Propagate**: update every doc + code point that references it
5. **Regression guard**: tests, lints, and “final check” lists

Convergence rule: **We prefer “one good answer” over “many okay answers.”**

---

## 7) The Artifact Discipline (Truth / Telemetry / Show)

We keep the system clean by separating outputs:

- **Truth**: authoritative logs + manifests
- **Telemetry**: derived stats/moments/standings
- **Show**: commentary/highlights/packaging

Workflow implications:

- never let show assets change truth
- telemetry must be recomputable from truth
- viewer must not leak hidden info; redaction rules are mandatory

This discipline is why the system stays verifiable even as it becomes more entertaining.

---

## 8) Testing + Verification Gates

Every code change is gated by:

- `npm run lint`
- `npm run typecheck`
- `npm test`

Plus at least one “real run” artifact:

- run the harness or match runner
- produce a sample output directory
- inspect it manually

Determinism gates (when required):

- same inputs → same bytes for `match.jsonl`
- stable serializer for JSON manifests
- stable seed derivation from declared inputs

Hidden-info gates:

- spectator view strips `_private` and other secret fields
- live playback never reveals future-only data

---

## 9) Branch + PR Hygiene

- never commit directly to `main`
- short-lived feature branches per phase
- PR titles describe outcome, not effort
- PR body includes:
  - summary
  - testing commands run
  - what to look at manually

Clean-up:

- delete merged branches
- prune remote stale refs

---

## 10) Documentation as a Living System

Docs are not “after.” They’re part of the machine.

Doc rules:

- specs must not contradict each other
- if docs and code disagree, we don’t silently rewrite reality
  - either update docs to match (if code is canonical)
  - or treat it as a bug and fix code
- do periodic reconciliation passes after multi-PR bursts

A good doc change has:

- explicit canonical answers
- explicit non-goals
- examples that match actual artifacts

---

## 11) How Claude + Codex + ChatGPT Work Together (Practical)

Typical pattern:

1. ChatGPT writes the prompt pack (phased, branch-scoped)
2. Claude executes doc lock/reconciliation tasks
3. Codex implements backend changes + tests
4. ChatGPT (or Claude) performs adversarial review of PR diffs
5. Kyle merges and records the outcome

We treat the agents as specialists, not as oracles.

---

## 12) “Do Not Guess” Policy

In practice, this means:

- don’t invent file paths
- don’t invent function names
- don’t invent CLI flags
- don’t “rename for cleanliness” unless explicitly instructed

If something is unknown:

- stop and report mismatch
- ask Kyle for the missing fact

This one rule prevents most long-tail disasters.

---

## 13) A Ready-to-Use Project Template

### 13.1 Phase A — Audit + Map

- scan repo structure
- list critical flows (core loop, artifacts, UI)
- identify contradictions and risk areas

### 13.2 Phase B — Decision Locks

- lock filenames, schemas, hashing rules, policy rules
- update docs to single-source-of-truth

### 13.3 Phase C — Build the Trust Spine

- manifests
- hashing
- verification CLI

### 13.4 Phase D — Build the Experience

- viewer UX
- moments
- commentary hooks

### 13.5 Phase E — Packaging + Distribution

- bundle formats
- validators
- registry/indexing (local first)

### 13.6 Phase F — Operator UX

- control plane
- workflows for running events

---

## 14) Checklist (Use This Every Time)

Before asking an agent to do work:

- is the goal a single sentence?
- are constraints listed?
- are files/paths named?
- is there a branch name?
- is there a definition of done?
- is there a non-goal list?

Before merging:

- tests pass
- outputs inspected
- docs updated or reconciled
- no accidental renames/moves

---

## 15) Notes for Future You

The point of this playbook is not to be rigid.
It’s to be _repeatable_.

When the project gets bigger and scarier, the workflow is what keeps the lights on.
