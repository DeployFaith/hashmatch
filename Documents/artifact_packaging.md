# Artifact Packaging

This document defines how HashMatch packages match/tournament outputs into portable bundles.

The goal is:

* everything can be copied as files
* bundles are replayable offline
* bundles support verification (hashes/receipts)
* bundles support spectator broadcast packaging

No servers required.

## 1. Packaging Principles

1. **Portable**

* a bundle should be a folder (or zip) you can move anywhere.

2. **Selfâ€‘describing**

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
* `show` (nonâ€‘authoritative)

This classification supports:

* integrity/verification rules
* spectator reveal/redaction rules
* â€œgenerated contentâ€ labeling

## 3. Match Bundle Layout

Recommended folder layout:

```text
match_bundle/
  match_manifest.json
  match.jsonl
  match_summary.json
  moments.json            (optional, derived)
  receipt.json            (optional, signed)
  show/
    commentary.json       (optional)
    highlights.json       (optional)
    assets/               (optional)
      thumbnails/
      overlays/
```

Notes:

* `match.jsonl` + `match_manifest.json` are required for replay.
* `match_summary.json` is recommended.
* show artifacts are optional, and `highlights.json` always lives in the show layer.

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

The â€œsplit foldersâ€ approach is optional; classification can also be done by manifest alone.

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

Hashing and signing are defined in `integrity_and_verification.md`. See `integrity_and_verification.md` Â§5.4 for byte-level hashing rules.

Packaging rules:

* truth files should be hashed consistently (same algorithm)
* receipt should bind at least `match.jsonl` + `match_manifest.json`
* telemetry hashes are optional convenience
* show artifacts should not be required to validate truth

## 8. Versioning

Bundles should include version stamps to prevent â€œit works on my machineâ€ confusion.

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

## 11. Showâ€‘Layer Rules

If show artifacts are included:

* label them nonâ€‘authoritative
* ground claims to truth/telemetry (event ranges / moments)
* obey visibility policies (do not leak secrets)

## 12. v0 Success Criteria

* match bundles replayable offline
* tournament bundles reproducible and readable
* broadcast bundles easy to publish
* receipts can be added later without repacking everything
