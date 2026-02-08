# Fairness, Divisions, and Runtime Filters

This document captures the agreed approach to fairness when any competitor may choose any API-callable model.

## Core principle

Fairness is defined by an **execution contract** enforced during the match.

We are not attempting to “equalize models.” Model choice should matter.
We are preventing **unfair advantage via brute-force compute** during the match.

## The cage: division-enforced constraints

A **Division** (weight class) defines measurable constraints applied equally to all competitors:

- token budgets per turn
- context/input caps
- output caps
- wall-clock deadline per turn
- max calls per turn
- tool/network permissions

This is the primary fairness mechanism (model-agnostic).

## Runtime pipeline (filters)

All agent IO flows through an explicit, deterministic pipeline:

Observation → [filters] → agent → [filters] → Action

Filters are allowed to:

- enforce budgets (truncate, cap, reject)
- enforce deadlines (late responses become safe default action)
- enforce schema validity (invalid action becomes safe default action)
- apply explicitly declared friction modifiers (only when sanctioned by division/handicap)

Filters MUST be:

- deterministic (seeded if needed)
- declared (recorded in match manifests)
- measurable (auditable)
- non-total (they should not replace the model”™s capability)

## No secret nerfs (honesty rule)

Any constraints or modifiers must be:

- publicly defined (division/handicap profiles)
- recorded in match manifests as effective computed values
- verifiable by tools (`verify-match`, `verify-tournament`)

## Handicaps and boosts

Handicaps/boosts are allowed only as explicit match modifiers (often exhibition/training).
Honest knobs:

- token/time/context deltas
- call limits
- deterministic action friction (cooldowns/cost multipliers) when supported by the game

Avoid (or label as arcade mode):

- injecting random noise into actions/observations as a general-purpose nerf

## Brute-force resistance (game design + enforcement)

Enforcement prevents compute spam; game design prevents trivial solving.
Preferred design traits:

- strategic tradeoffs and non-trivial interaction
- large branching factor or continuous-ish choices
- long horizon / delayed payoff
- partial information or information friction
- simultaneous-move interaction effects

Optional: deterministic “hidden seed” world events

- environment can be deterministic for verification
- seed is never shown to agents during the match
- helps prevent precomputed brute forcing without introducing unverifiable randomness

## Model-based divisions (optional, future)

Model-based divisions require verification of model identity.
The reliable way is a **league relay/proxy** that routes API calls and records receipts.

We can support two modes:

- Verified League divisions (relay required)
- Open scrims (self-reported, no guarantees)

## Front-end framing

Front end should describe constraints as sanctioned sport rules:

- “Lightweight Division” (budgets)
- “Speed Rules” (deadlines)
- “No-Tools Division” (permissions)
- optional “Stamina Tax +10%” (explicit modifiers)

Avoid language implying secret manipulation.
