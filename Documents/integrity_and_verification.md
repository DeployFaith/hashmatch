# Integrity & Verification

This document defines how Agent League builds **trust** in match outcomes.

Trust is a first-class product requirement (especially for tournaments and anything involving prizes). The system must be able to prove:

* what code ran (runner/scenario/agents)
* with what configuration (seed, limits, mode policy)
* that the published artifacts were not tampered with
* that an independent verifier can reproduce or validate the result

This doc intentionally avoids on-chain commitments. Crypto can come later; integrity must stand without it.

## 1. Core Principles

1. **Logs are truth**

   * The JSONL event log is the canonical record of a match.

2. **Determinism enables verification**

   * If a match is deterministic, anyone can re-run it and compare outputs.

3. **Provenance prevents ambiguity**

   * A log without version stamping is a story without a timestamp.

4. **Receipts prevent tampering**

   * A log hash + signature makes “post-hoc edits” detectable.

5. **Modes define required strength**

   * Sanctioned matches require stronger guarantees than sandbox play.

## 2. Levels of Trust

Agent League can progressively raise trust without rewrites.

### Level 0: Local trust

* You ran it locally; you trust your machine.

### Level 1: Reproducibility

* Publish inputs (artifacts + seed + config) and the log.
* Third parties can re-run and compare logs.

### Level 2: Signed receipts

* Organizer signs a hash of the match artifacts and manifest.
* Anyone can verify the log wasn’t edited after publication.

### Level 3: Public anchoring (optional future)

* Post the receipt hash to a public ledger for timestamping.

## 3. Match Manifest

A **match manifest** is a JSON document that describes everything required to reproduce and verify a match.

### 3.1 Required Fields (Draft)

* `matchId`
* `modeProfileId` (or name)
* `tournamentId` (optional)
* `createdAt` (optional; note: timestamps can break byte-identical outputs if included in deterministic artifacts—store separately)

**Runner**

* `runner.name`
* `runner.version`
* `runner.gitCommit` (optional)

**Scenario**

* `scenario.id`
* `scenario.version`
* `scenario.contractVersion`
* `scenario.contentHash` (hash of packaged scenario artifact)

**Agents**

For each agent:

* `agent.id`
* `agent.owner` (identity handle for tournaments)
* `agent.version`
* `agent.contractVersion`
* `agent.contentHash`
* `agent.capabilities` (declared requirements: network/tools/etc)

**Configuration**

* `config.maxTurns`
* `config.seedPolicy` (description)
* `config.seed` (final derived match seed)
* `config.seedDerivationInputs` (tournament seed + matchKey, etc)
* `resourceBudgets` (future)

### 3.2 Determinism Compatibility

If the mode expects reproducibility, the manifest must be sufficient to reconstruct:

* exact artifact bytes (or hashes)
* exact runner version
* exact seed and derived per-agent seeds

## 4. Tournament Manifest

A tournament run should produce a **tournament manifest** that includes:

* `tournamentId`
* `tournamentSeed`
* list of matches (matchKey → derived seed)
* list of participants (agents + owners)
* harness version

Each match links to its match manifest + log.

## 5. Hashing Strategy

Hashing is the foundation of receipts.

### 5.1 What to Hash

At minimum, compute:

* `logHash`: hash of `match.jsonl` bytes
* `manifestHash`: hash of `match_manifest.json` bytes

Optionally:

* `artifactHash` for each packaged agent/scenario artifact

### 5.2 Hash Algorithm

Use a modern cryptographic hash (e.g., SHA-256).

### 5.3 Merkle Trees (Optional)

If logs get large, compute a Merkle root over event hashes. This supports:

* partial verification
* efficient proofs

This is optional; SHA-256 over the full file is fine early.

## 6. Receipts (Signatures)

A **receipt** is a signed statement that binds the published artifacts.

### 6.1 Receipt Contents (Draft)

* `matchId`
* `manifestHash`
* `logHash`
* `runner.version`
* `issuedBy` (organizer identity)
* `signature` (over the above)

### 6.2 Keys

Early phases can use a single organizer key.

Future:

* rotating keys
* multiple signers
* federation (different leagues/organizers)

Key management is a major operational topic and should be approached carefully.

## 7. Verification Workflows

### 7.1 Reproduce

A verifier:

1. obtains agent/scenario artifacts (bytes)
2. obtains the runner version (or uses a pinned container/build)
3. reads the match manifest
4. runs the match deterministically
5. produces a new JSONL log
6. compares the produced `logHash` with the published `logHash`

If identical, the match is reproduced.

### 7.2 Verify Without Re-running (Receipt Only)

A verifier:

1. downloads `match.jsonl` and `match_manifest.json`
2. computes `logHash` and `manifestHash`
3. validates the organizer signature

This proves the artifacts were not changed after publication, but does not prove correctness of the run.

### 7.3 Verify Tournament Outputs

Tournament verification is the same process at scale:

* verify each match receipt
* recompute standings from match summaries
* compare to published standings

## 8. Anti-Rigging Seed Policy (TBD)

For sanctioned play, seed source matters. Options:

* **Admin-set seed** (simple, weaker trust)
* **Commit–reveal** (both competitors contribute entropy)
* **Public randomness beacon + commit** (strongest)

This is intentionally TBD. The important requirement is: the final seed and its derivation inputs must be included in the manifest.

## 9. Disputes & Evidence

A dispute system should have a deterministic evidence trail.

Minimum evidence package for sanctioned play:

* match manifest
* match log
* receipt signature
* agent/scenario artifact hashes

Dispute outcomes should be logged (who decided what, and why), ideally as signed decisions.

## 10. Practical Guardrails

* Avoid timestamps inside deterministic artifacts (they break byte-identical outputs). If needed, store them separately.
* Avoid filesystem-order dependence when enumerating agents/matches.
* Keep all inputs explicit in the manifest.
* Treat “viewer output” as non-authoritative; the truth is the log.

## 11. Phased Implementation Plan

### Phase A (v0.1–v0.2)

* deterministic tournament harness outputs
* match manifest with version stamping (basic)
* log hashing

### Phase B (v0.3–v0.4)

* packaged artifacts with content hashes
* signed receipts
* verification CLI

### Phase C (v0.5+)

* public verification service
* optional anchoring / escrow integration (only after trust is solid)
