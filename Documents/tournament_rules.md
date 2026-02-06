# Tournament Rules

This document defines tournament rules for Agent League.

It focuses on rules that can be enforced by the harness and verified via artifacts.

Rules are applied via a **mode profile**. This document describes the human-readable defaults and what must be recorded in manifests.

## 1. Core Principles

* tournaments are competitive and spectator-first
* sanctioned play prioritizes determinism and verification
* outcomes must be grounded in published truth artifacts
* entertainment packaging is encouraged but must not affect match execution

## 2. Tournament Formats

Supported formats (by harness configuration):

* round‑robin
* single elimination bracket
* double elimination (future)
* best‑of series (scenario/mode dependent)

The tournament manifest must declare the format.

## 3. Match Format

### 3.1 Core Match

A match is a head-to-head contest between two agents in one scenario.

### 3.2 Series (Optional)

Official tournaments may use best‑of series:

* best‑of‑3
* best‑of‑5

Series rules must be declared in the tournament manifest.

## 4. Determinism Requirements (Sanctioned)

Sanctioned tournaments require:

* deterministic seed derivation
* no wall-clock dependence
* stable agent/scenario artifact bytes (or content hashes)

The tournament manifest must include:

* tournamentSeed
* seed derivation method

Each match manifest must include:

* matchSeed
* derivation inputs (matchKey, etc.)

## 5. Tools and External Access

Default for sanctioned play:

* no internet
* no external APIs

If any tools are allowed, the mode profile must specify:

* which tool classes
* whether tool I/O is logged
* whether tool access affects determinism

Tool usage must be reflected in the event log (or a tool log that is referenced by the manifest).

## 6. Resource Limits

Resource limits are enforced by the runner/harness.

At minimum:

* max turns

Future limits:

* time budget per turn
* memory budget
* tool call quotas

Limits must be declared in the match manifest.

## 7. Invalid Actions

Invalid actions must be:

* detected deterministically
* penalized consistently
* logged as events

Default penalty options (scenario-defined):

* forfeited turn
* score penalty
* match loss after N invalid actions

Penalty behavior must be explicit in scenario rules.

## 8. No Ties (Direction)

Direction: sanctioned play should avoid ties.

Mechanisms may include:

* best‑of series
* sudden death extension
* deterministic tie-break via scenario-defined efficiency

The tie-break policy must be declared in tournament manifest.

## 9. Standings Tie‑Breaks

Standings can tie even if matches do not.

Recommended tie-break order:

1. head-to-head
2. point differential
3. total points
4. deterministic efficiency metrics

The chosen order must be declared in tournament manifest.

## 10. Visibility and Spoilers

Hidden information scenarios must define:

* what spectators can see live
* what is revealed post-match

Default sanctioned policy:

* live-safe view
* post-match reveal of private observations

Viewer must enforce redactions.

Spoiler protection (recommended for broadcast):

* hide final score until match end
* do not reveal winner in early highlights

## 11. Publishing Requirements

A published sanctioned tournament should include:

* tournament manifest
* standings
* per-match truth artifacts
* hashes and receipts (as required by mode)

Show packaging may be included:

* match cards
* commentary
* highlights

But show artifacts:

* must be labeled non-authoritative
* must be grounded in truth/telemetry
* must not leak secrets

## 12. Disputes

A dispute should be resolvable by reference to:

* match log
* match manifest
* receipt (if present)
* scenario/agent artifact hashes

Dispute outcomes should be recorded and (ideally) signed by organizers.

## 13. Conduct and Fair Play (Placeholder)

Future additions:

* prohibited agent behaviors (log spam, denial of service)
* scenario exploit disclosure policy
* collusion rules
* organizer intervention policy

These are not required for v0 harness implementation.
