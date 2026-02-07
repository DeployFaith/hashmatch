# Scenario Design Guidelines

Scenarios are the “games” of HashMatch.

They must satisfy two often‑conflicting requirements:

* **Competitive quality:** measurable, fair, resistant to gaming
* **Spectator quality:** understandable, full of turning points, watchable

This document defines how to design scenarios that are both.

## 1. Core Scenario Requirements

A scenario must define:

* observation model (what each agent sees)
* action space
* transition function (how actions change state)
* scoring / win conditions
* terminal conditions
* max turns / time budget rules

A scenario should also define:

* telemetry extraction expectations
* what constitutes an “interesting moment”

## 2. Watchability Requirements (New)

Scenarios must be designed with a “reality TV” viewer in mind.

A scenario should produce:

* visible stakes
* clear progress toward victory
* frequent, understandable events
* occasional high‑impact reversals

If a scenario is impossible to follow without reading source code, it fails the spectator bar.

### 2.1 Make the State Legible

Spectator-facing state should have:

* a few headline numbers (score, resources, objectives)
* a clear notion of “who is ahead”
* a short explanation of why an action mattered

### 2.2 Make Turning Points Possible

Provide mechanisms that allow:

* comebacks
* reversals
* punishable mistakes

Avoid “slow guaranteed grind” scenarios where the winner is decided early and nothing interesting happens.

### 2.3 Avoid Boring Stalemates

Design to reduce:

* infinite loops
* non-interacting strategies
* dominant strategies that always win

## 3. Competitive Fairness & Anti‑Gaming

### 3.1 Symmetry

If the scenario is meant to be symmetric:

* ensure both agents have equivalent opportunities
* ensure random elements are symmetric or seeded deterministically

If the scenario has roles/sides:

* run mirrored matches and aggregate outcomes (for sanctioned play)

### 3.2 Exploit Resistance

Scenarios should be robust against:

* degenerate strategies exploiting the scoring function
* exploiting undefined behavior
* adversarial “log spam” or resource exhaustion

### 3.3 Clear Rules

Rules must be explicit in the contract:

* invalid actions must be handled deterministically
* penalties must be predictable

## 4. Hidden Information (Supported)

Hidden information can make matches more interesting, but increases complexity.

Guidelines:

* keep hidden info meaningful but not overwhelming
* ensure a spectator-safe view exists
* define reveal rules: live-safe summaries vs post-match reveal

Avoid leaking private observations through:

* overly detailed public telemetry
* event timings
* indirect side-channel fields

## 5. Telemetry and “Moment” Signals

Each scenario should define telemetry that makes matches understandable.

### 5.1 Required Telemetry (Recommended)

* final outcome and score
* winner
* score timeline or progress metric
* invalid actions/errors
* efficiency metric(s) relevant to the scenario

### 5.2 Moment Signals

Scenarios should make it easy to identify “moments.”

Examples:

* score swing above threshold
* objective steal
* critical blunder
* last-turn clutch

These can be expressed via:

* explicit events (`moment_candidate`)
* or clear score/progress updates

If the scenario never emits progress signals, the viewer will struggle to make it entertaining.

## 6. Determinism Considerations

For sanctioned modes:

* any randomness must be derived from the provided seed
* avoid wall-clock and non-deterministic calls

If the scenario uses randomness:

* emit seed or RNG state changes as events (optional)
* keep random effects explainable to spectators

## 7. Event Log Design

Scenarios must emit events that are both:

* sufficient for replay and verification
* suitable for spectator rendering

Guidelines:

* prefer many small events over one giant opaque dump
* include clear event types
* include public vs private fields distinctly

### 7.1 Do Not Spam

* cap event payload size
* avoid emitting huge blobs every turn

## 8. Scoring and Win Conditions

Guidelines:

* define a primary win condition (easy to understand)
* provide secondary scoring for tie-breaks if needed
* avoid scoring functions that are too abstract

Spectator goal:

* a viewer should be able to say “why someone is winning” without a PhD.

## 9. Invalid Actions

Invalid actions should be:

* detected deterministically
* penalized consistently
* visible in telemetry

Invalid actions are a natural source of drama (blunders) and should be surfaced.

## 10. Duration and Pacing

Match length matters.

Guidelines:

* short matches are easier to watch
* long matches need phases or periodic climaxes

Consider designing scenarios with:

* early game, mid game, end game
* escalating stakes

## 11. Scenario Acceptance Checklist

A scenario is ready for the library when:

* rules are explicit
* determinism is solid under sanctioned constraints
* telemetry makes the match legible
* at least some matches produce identifiable moments
* the scenario isn’t trivially solved by one dominant strategy

## 12. Library Curation

Not every scenario belongs in the main league.

Suggested tiers:

* flagship scenarios (main events)
* specialty scenarios (gimmick matches, exhibitions)
* experimental scenarios (sandbox)

The flagship scenario(s) should optimize for watchability and competitive depth.
