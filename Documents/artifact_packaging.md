# Artifact Packaging

This document defines how Agent League packages **agents** and **scenarios** as versioned artifacts.

Packaging is the bridge from:

* “a local demo in a repo”

to:

* “an ecosystem where people install, share, and compete with artifacts”

This specification is intentionally **offline-first**. A hosted registry/marketplace can be built later on top of these formats.

## 1. Goals

* Make agents and scenarios distributable and versioned.
* Enable compatibility checks against a contract version.
* Support integrity and verification via content hashes.
* Provide enough metadata for discovery and community reputation.

## 2. Artifact Types

### 2.1 Agent Artifact

A packaged agent that implements the `Agent` interface for a specific contract version.

### 2.2 Scenario Artifact

A packaged scenario that implements the `Scenario` interface for a specific contract version.

## 3. Directory Layout (Draft)

An artifact is a folder (or tar/zip archive) with:

```
<artifactRoot>/
  manifest.json
  dist/
    index.js
  assets/ (optional)
  README.md (optional)
  LICENSE (optional)
```

Notes:

* `dist/index.js` is the built entry point.
* `assets/` can include scenario data files, images, etc.
* The artifact must be loadable without network access in sanctioned modes.

## 4. Manifest Format

`manifest.json` is required.

### 4.1 Common Fields

```json
{
  "artifactType": "agent" | "scenario",
  "id": "string",
  "version": "1.0.0",
  "name": "Human readable name",
  "description": "Short description",
  "author": {
    "name": "string",
    "handle": "string",
    "url": "string"
  },
  "license": "MIT",
  "contractVersion": "v0",
  "entry": "dist/index.js",
  "tags": ["string"],
  "capabilities": {
    "deterministic": true,
    "requiresNetwork": false,
    "requiresTools": []
  }
}
```

### 4.2 Agent-Specific Fields

```json
{
  "agent": {
    "observationSchema": "optional",
    "actionSchema": "optional"
  }
}
```

### 4.3 Scenario-Specific Fields

```json
{
  "scenario": {
    "minPlayers": 2,
    "maxPlayers": 2,
    "supportsTeams": false,
    "supportsHiddenInfo": true,
    "telemetry": ["scoreTimeline", "errors"]
  }
}
```

Schema enforcement can be introduced later. Start with best-effort validation.

## 5. Content Hashing

Artifacts should be hashable so that:

* match manifests can reference exact bytes
* receipts can bind outcomes to specific artifact versions

### 5.1 Artifact Hash

Compute a stable hash of the artifact contents.

Rules:

* exclude ephemeral files (`node_modules`, temp files)
* normalize file ordering when hashing

Store the hash in:

* match manifests (for verification)
* registry catalogs (for integrity)

## 6. Compatibility

### 6.1 Contract Compatibility

An artifact must declare its `contractVersion`.

The harness/runner must refuse to load artifacts with incompatible versions.

### 6.2 Capability Compatibility (Mode Profiles)

Mode profiles restrict capabilities:

* sanctioned mode likely forbids `requiresNetwork: true`
* exhibition may allow
* sandbox may allow

Artifacts must truthfully declare capability requirements.

In early phases, this is enforced by policy + review; later, enforce via sandboxing.

## 7. Loading Model

The local runtime loads artifacts by:

1. reading `manifest.json`
2. verifying contract compatibility
3. verifying capability compatibility (mode)
4. importing `entry`
5. instantiating the exported factory

### 7.1 Export Convention (Draft)

Artifacts export a default factory:

* Agent artifact exports `createAgent()`
* Scenario artifact exports `createScenario()`

Exact conventions can be finalized later.

## 8. Local Registry (Offline)

A local registry is a directory of installed artifacts:

```
registry/
  agents/
    <id>@<version>/
  scenarios/
    <id>@<version>/
```

A CLI can support:

* `install <path>`
* `list agents|scenarios`
* `validate <id>@<version>`
* `hash <id>@<version>`

## 9. Hosted Registry / Marketplace (Future)

A hosted registry can be built later by storing:

* manifests
* artifact archives
* content hashes
* reputation signals

The packaging format should not assume any particular backend.

## 10. Security Notes

* Treat artifacts as untrusted code.
* Sanctioned modes must eventually run artifacts in isolation (process/container sandbox).
* Until sandboxing exists, sanctioned tournaments should rely on curated artifacts.

## 11. Phased Plan

### Phase A (v0.3)

* define manifest format
* package artifacts locally
* local registry

### Phase B (v0.4)

* include artifact hashes in match manifests
* signed receipts reference artifact hashes

### Phase C (v0.5+)

* hosted registry
* marketplace features
