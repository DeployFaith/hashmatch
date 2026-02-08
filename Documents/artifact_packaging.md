# Artifact Packaging

This document defines how HashMatch packages match/tournament outputs into portable bundles.

The goal is:

* everything can be copied as files
* bundles are replayable offline
* bundles support verification (hashes/receipts)
* bundles support spectator broadcast packaging

No servers required.
For product framing on why artifacts remain the trust substrate, see “Artifacts: Trust Substrate, Not Product Surface” in `hashmatch_live_platform_direction_decision_architecture.md`.

## 1. Packaging Principles

1. **Portable**

* a bundle should be a folder (or zip) you can move anywhere.

2. **Self”‘describing**

* includes manifests that explain contents and versions.

3. **Layered**

* bundles may include truth, telemetry, and show artifacts.

4. **Verifiable**

* truth artifacts can be hashed and signed.

5. **Composable**

* tournament bundles contain match bundles.

## 2. Layer Classification

Every file in a bundle should be classified as one of:

* `truth` (authoritative)
* `telemetry` (derived from truth)
* `show` (non”‘authoritative)

This classification supports:

* integrity/verification rules
* spectator reveal/redaction rules
* “generated content” labeling

## 3. Match Bundle Layout

Recommended folder layout:

```text
match_bundle/
  match_manifest.json
  match.jsonl
  match_summary.json
  moments.json                (optional, derived)
  receipt.json                (optional, signed)
  agent_profiles.json         (optional, show)
  validation_report.json      (optional, derived)
  watchability_report.json    (optional, derived)
  show/
    commentary.json           (optional)
    highlights.json           (optional)
    assets/                   (optional)
      thumbnails/
      overlays/
```

Notes:

* `match.jsonl` + `match_manifest.json` are required for replay.
* `match_summary.json` is recommended.
* show artifacts are optional, and `highlights.json` always lives in the show layer.

### 3.1 Replay Enhancement Artifacts

The following optional artifacts enrich the replay experience without affecting truth or verification:

- **`agent_profiles.json`** — Metadata about participating agents (display name, avatar URL, description, author, version history). Used by the viewer for richer agent presentation. Classification: `show`.
- **`moments.json`** — Pre-computed interesting moments (lead changes, blunders, comebacks). When present, the viewer uses these instead of computing moments on-the-fly. Classification: `telemetry`.

These files are not required for replay correctness but significantly improve the spectator experience.

### 3.2 Validator Output Artifacts (Future)

Post-match validators may produce the following artifacts alongside truth and telemetry:

- **`validation_report.json`** — A `ValidationReport` (see `specification.md` §13.1) asserting structural soundness and internal consistency of match artifacts. Classification: `telemetry`.
- **`watchability_report.json`** — A `WatchabilityScoreReport` (see `specification.md` §13.2) evaluating spectator engagement heuristics. Classification: `telemetry`. Optional until simulation infrastructure is operational.

Both are regenerable from truth-layer artifacts at any time and do not affect verification.

## 4. Tournament Bundle Layout

Recommended folder layout:

```text
tournament_bundle/
  tournament_manifest.json
  standings.json
  receipt.json                  (optional)
  matches/
    <matchId>/                  (match bundle folders)
      ...
```

## 5. Broadcast Bundle

A broadcast bundle is a packaging variant optimized for spectators and distribution.

It may be identical to match/tournament bundles, but adds:

* `broadcast_manifest.json` to explicitly list contents and classification (implemented)
* `card.json` (optional) for fight night packaging

Example:

```text
broadcast/
  broadcast_manifest.json
  card.json                     (optional)
  truth/
    match.jsonl
    match_manifest.json
  telemetry/
    match_summary.json
    moments.json
  show/
    commentary.json
    highlights.json
    assets/
```

The “split folders” approach is optional; classification can also be done by manifest alone.

## 6. Manifests

### 6.1 Match Manifest

The match manifest describes reproducibility inputs. (Defined in Integrity doc.)

### 6.2 Tournament Manifest

The tournament manifest describes match list + seeds and harness version.

### 6.3 Broadcast Manifest (Implemented)

`broadcast_manifest.json` is implemented (see `src/core/broadcastManifest.ts`) and should include the fields below. It is a packaging artifact, not truth or telemetry.

* `bundleId`
* `bundleType: match | tournament`
* `modeProfileId`
* `createdBy` (organizer/harness)

**Files list**

For each file:

* `path`
* `class: truth | telemetry | show`
* `contentHash` (optional early; recommended later)
* `mediaType` (optional)

**Truth bundle hash** (optional but recommended)

* `truthBundleHash` computed over the canonical truth files

## 7. Hashing & Receipts

Hashing and signing are defined in `integrity_and_verification.md`. See `integrity_and_verification.md` §5.4 for byte-level hashing rules.

Packaging rules:

* truth files should be hashed consistently (same algorithm)
* receipts are implemented:
  - `receipt.json` per match directory
  - `tournament_receipt.json` at the tournament root
* receipt should bind at least `match.jsonl` + `match_manifest.json`
* telemetry hashes are optional convenience
* show artifacts should not be required to validate truth

## 8. Versioning

Bundles should include version stamps to prevent “it works on my machine” confusion.

* harness version
* runner version
* scenario version
* agent versions
* contract version

## 9. Compression

Bundles may be distributed as:

* folder
* `.zip`
* `.tar.gz`

Do not assume a particular compression format in core tooling.

## 10. Registry Integration (Later)

A local registry can index bundles by:

* bundleId
* scenario id
* agent ids
* mode profile
* time

Hosted registry is future work.

## 11. Show”‘Layer Rules

If show artifacts are included:

* label them non”‘authoritative
* ground claims to truth/telemetry (event ranges / moments)
* obey visibility policies (do not leak secrets)

## 12. v0 Success Criteria

* match bundles replayable offline
* tournament bundles reproducible and readable
* broadcast bundles easy to publish
* receipts can be added later without repacking everything
