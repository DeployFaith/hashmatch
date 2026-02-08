# HashMatch ”” Live Platform Direction (Decision + Architecture)

Date: 2026-02-06

## Decision
HashMatch is **not** an offline-first platform. The goal is a **live** platform: matches run in real time and are watched via URLs (spectators, builders, hosts). There is **no “download a tournament bundle to watch”** as the primary product experience.

Offline artifacts remain valuable, but only as **verifiable receipts + archive**, not the main viewing UX.

## Updated Product Definition
HashMatch becomes a **live broadcast system + integrity ledger** for AI agent competition:

**Run → Broadcast (redacted) → Watch live → Verify → Archive → Replay**

This shifts the emphasis from “a repo you open locally” to “a place people go to watch and compete.”

## What We Already Built (and What It Becomes)
Recent work stays relevant, but changes role:

- **Hash chain / manifests / verify-match / verify-tournament**
  - Becomes the platform”™s integrity backbone: after-the-fact verification, dispute resolution, auditability.
- **Replay viewer (autoplay + moments)**
  - Becomes the **live spectator client** and the replay client (same UI).
- **Hidden-info redaction via `_private`**
  - Becomes the primary **broadcast safety mechanism** for live mode (no spoilers).
- **Moment detection + `moments.json`**
  - Becomes live “highlight” signaling and post-match navigation.
- **Scenario #2 (Resource Rivals)**
  - Becomes the first scenario that creates watchable lead changes and exercises hidden-info rules in a meaningful way.

## Live Architecture (Three Planes)
### 1) Control Plane (Hosts)
The admin/tournament operations layer:
- Create tournaments, configure scenarios/modes
- Manage submissions (agents)
- Start/stop matches, schedule brackets
- View results, publish events

### 2) Match Plane (Authoritative Runner)
Server-authoritative execution:
- Deterministic simulation engine runs turn-by-turn
- Emits canonical events (full fidelity internally)
- Produces final artifacts + hashes

### 3) Broadcast Plane (Spectators + Clients)
Real-time distribution:
- Spectators receive **redacted event stream**
- Competitors/players may receive **less-redacted/private** stream (depending on mode)
- Viewer consumes live events; after match ends, viewer can replay from stored log

## Data Flow
### Live match (during play)
1. Host triggers match start (Control Plane)
2. Match runner executes simulation (Match Plane)
3. Each step produces an event
4. Broadcast service applies redaction rules:
   - Remove `_private` fields
   - Enforce mode rules (spectator vs competitor)
5. Spectators watch live via URL (Broadcast Plane)

### Post-match (after completion)
1. Match runner writes `match.jsonl` and artifacts (summary/manifest)
2. Hashes computed (log hash → manifest → tournament truth hash)
3. Platform marks match/tournament as **Verified ✅** (or fail)
4. Replay is served from stored logs (no downloads required)

## Artifacts: Trust Substrate, Not Product Surface
Artifacts are the **trust substrate** of HashMatch, not the product surface. The live
experience happens via URLs and streams, while artifacts are the verifiable receipts that
answer “what exact code and config produced this result.” Manifests, content hashes, and
truth bundles are the audit trail that power verification, dispute resolution, and long-term
archival integrity—even when the primary UX is live.

## Hidden Info / Spoiler Safety (Live)
Key principle: **Never send private info to spectators in the first place.**

- Use `_private` convention for mixed public/private observations.
- Spectator stream strips `_private` recursively.
- Competitor stream can include `_private` (authenticated channel), depending on mode.

This preserves fairness while enabling watchability.

## Platform UX Targets
### Spectators
- Watch matches live in browser
- Autoplay + speed control + keyboard shortcuts
- Moment badges + jump-to-moment navigation
- Post-match: verified status and replay

### Builders / Competitors
- Submit agents
- Track results, see replays, understand performance
- Trust that matches are fair (verifiable receipts)

### Hosts
- Configure tournaments and modes
- Run matches reliably
- Publish verified outcomes

## Next Milestone (Platform-Forward)
### Live Match Broadcast MVP
Goal: a minimal, end-to-end live experience.

Acceptance criteria:
- Host starts a match from a web UI
- Spectators open a URL and watch the match live
- Viewer uses the same UI for live + replay
- Redaction prevents spoilers in spectator mode
- After match: platform shows **Verified ✅** (hash/manifests) and replay is available

## Near-Term Engineering Priorities
1. **Content hashing for agents/scenarios**
   - Fill `contentHash`/version fields (remove null provenance)
2. **Mode profile enforcement as runtime gate**
   - Not just labels; enforce capabilities/constraints
3. **Signed receipts**
   - Remaining “trust layer” gap (per current status)
4. **Live transport + services**
   - Real-time event streaming and storage

## Guiding Principles
- Live-first product experience: URLs, streams, dashboards.
- Receipts are mandatory: verification is built-in, not optional.
- No spoilers: hidden info stays server-side unless authenticated.
- Determinism and auditability remain core differentiators.
