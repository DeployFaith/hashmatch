# Integrity & Verification

This document defines how HashMatch builds **trust** in match outcomes.

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

HashMatch can progressively raise trust without rewrites.

### Level 0: Local trust

* You ran it locally; you trust your machine.

### Level 1: Reproducibility

* Publish inputs (artifacts + seed + config) and the log.
* Third parties can re-run and compare logs.

### Level 2: Signed receipts

* Organizer signs a hash of the match artifacts and manifest.
* Anyone can verify the log wasn”™t edited after publication.

### Level 3: Public anchoring (optional future)

* Post the receipt hash to a public ledger for timestamping.

## 3. Match Manifest

A **match manifest** is a JSON document that describes everything required to reproduce and verify a match.

### 3.1 Required Fields (Draft)

* `matchId`
* `modeProfileId` (or name)
* `tournamentId` (optional)
* `createdAt` (optional; note: timestamps can break byte-identical outputs if included in deterministic artifacts””store separately)

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

`contentHash` is computed as SHA-256 of a deterministic JSON manifest that maps
`relativePath -> sha256(fileBytes)` for the files that make up the runtime artifact.
Paths are sorted lexicographically, serialized with stable JSON, and hashed again to
produce the final `sha256:...` value, making it portable across machines.
If no explicit artifact version is available, the manifest uses `unversioned` for
the `version` fields.

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
- Authenticity requires signed receipts (implemented)

## 6. Receipts (Signatures)

A **receipt** is a signed statement that binds the published artifacts.

### 6.1 Receipt Contents (Implemented)

**Receipt envelope:**

* `version` (currently `1`)
* `algorithm` (`ed25519`)
* `payload` (see below)
* `signature` (hex signature over the payload)
* `publicKey` (hex-encoded organizer key)
* `signedAt` (optional ISO timestamp)

**Match payload:**

* `matchId`
* `manifestHash`
* `logHash`
* `runnerVersion`
* `issuedBy` (organizer identity)

**Tournament payload:**

* `tournamentId`
* `truthBundleHash`
* `matchCount`
* `issuedBy` (organizer identity)

### 6.2 Keys

Receipts use **Ed25519** signatures. Keys are stored and loaded in **PEM** format.

The v0 model assumes a **single organizer key** per league/tournament.

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

## 8. Seed Integrity Protocol

For sanctioned play, the seed source directly impacts trust. A compromised seed allows an organizer or participant to pre-compute favorable outcomes. This section defines the commit-reveal protocol that replaces the earlier TBD placeholder.

### 8.1 Commit-Reveal Protocol

The protocol uses HMAC to commit to a server seed before agents are selected or match parameters are finalized.

**Phase 1: Commit**

The match organizer (or runner) generates a random `serverSeed` and publishes a commitment:

```
commitment = HMAC-SHA256(serverSeed, matchId || tournamentSeed)
```

Input fields:

- `matchId`: unique identifier for the match
- `tournamentSeed`: the tournament-level seed (empty string for standalone matches)

The commitment is published before agent code is frozen or match parameters are finalized. The `serverSeed` itself is withheld.

**Phase 2: Match Execution**

The match runs using the final derived seed (computed from `serverSeed`, `matchId`, and `tournamentSeed` per the existing seed derivation logic). The commitment is included in the match manifest under `config.seedCommitment`.

**Phase 3: Reveal**

After the match completes and the event log is finalized:

1. The organizer publishes the `serverSeed` in the match receipt or as a separate `seed_reveal.json` artifact.
2. Any verifier can recompute the commitment and confirm it matches the pre-published value.

**Verification steps:**

1. Obtain `serverSeed` from the reveal artifact.
2. Obtain `matchId` and `tournamentSeed` from the match manifest.
3. Compute `HMAC-SHA256(serverSeed, matchId || tournamentSeed)`.
4. Compare to `config.seedCommitment` in the manifest.
5. Confirm the derived match seed matches the `seed` in the `MatchStarted` event.

### 8.2 Manifest Fields

The match manifest gains the following fields under `config`:

- `seedCommitment`: the HMAC commitment (hex string), published before match execution
- `seedRevealArtifact`: path or reference to the reveal artifact (populated post-match)

### 8.3 External Entropy Integration (Phase C, Optional)

For the highest trust tier, the protocol can incorporate external entropy sources:

- **drand**: public randomness beacon providing verifiable, unbiasable randomness
- **Chainlink VRF**: on-chain verifiable random function

When external entropy is used, the seed derivation becomes:

```
finalSeed = SHA256(serverSeed || externalEntropy || matchId || tournamentSeed)
```

The external entropy proof (drand round number + signature, or Chainlink VRF proof) is stored in the match manifest under `config.externalEntropy`. This is Phase C work and is not required for the initial implementation.

### 8.4 Threat Vectors

The protocol is designed to mitigate the following threats:

| Threat | Description | Mitigation |
| --- | --- | --- |
| Seed selection | Organizer picks a seed that favors a particular agent | Commitment published before agents are finalized; reveal is verifiable |
| Selective abort | Organizer discards unfavorable matches before publishing | Commitment is public; missing reveals are detectable and flaggable |
| Participant collusion | Agent owner and organizer collude on seed choice | External entropy (Phase C) removes organizer control over final seed |
| Replay manipulation | Organizer publishes a different seed post-hoc | HMAC commitment binds the seed to the match identity; mismatch is detectable |

**Residual risk:** Without external entropy, the organizer can still generate many candidate `serverSeed` values and pick one. The commit-reveal protocol makes this detectable only if the commitment timestamp is anchored (see §11 Phase C: public anchoring). External entropy eliminates this vector entirely.

### 8.5 Backward Compatibility

Matches that do not use the seed integrity protocol (e.g., sandbox and exhibition modes) continue to work as before. The `seedCommitment` field is optional in the manifest. Verification tooling should treat a missing commitment as "seed integrity not asserted" rather than a failure.

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

### Phase A (v0.1”“v0.2)

* deterministic tournament harness outputs
* match manifest with version stamping (basic)
* log hashing

### Phase B (v0.3”“v0.4)

* packaged artifacts with content hashes
* signed receipts
* verification CLI

### Phase C (v0.5+)

* public verification service
* optional anchoring / escrow integration (only after trust is solid)

## 12. Implementation Status (Repo Audit)

Last audited: 2026-02-07

**Phase A status:**

* Deterministic tournament harness outputs: ✅ implemented (`src/tournament/`).
* Match manifest with version stamping: ✅ implemented (`match_manifest.json` per match; optional provenance fields via CLI flags).
* Log hashing: ✅ implemented (`logHash`, `manifestHash`, `truthBundleHash`).

**Phase B status:**

* Verification CLI: ✅ implemented (`verify-match`, `verify-tournament`, `verify-receipt`).
* Signed receipts: ✅ implemented (`src/core/receipt.ts`, `sign-tournament`).
* Receipt validation: ✅ implemented (`verify-receipt`).

**Phase C:** Not started.
