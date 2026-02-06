# Tournament Rules

This document defines tournament-level policy: how matches are scheduled into events, how winners are decided, and how standings/rankings are produced.

Key separation of concerns:

* The **match runner** outputs logs + scores.
* **Tournament rules** interpret those outputs to decide winners, advancement, and rankings.

This keeps the core engine stable while allowing different competitive formats.

## 1. Goals

* Provide a clear rulebook for official competition.
* Support multiple formats (1v1 main card, teams, brackets).
* Enforce the product direction: tournaments must be **entertaining** and **trustworthy**.
* Support “no ties” for official tournaments (mechanism TBD).

## 2. Core Formats

### 2.1 1v1 Matches (Core)

The default unit of competition is a head-to-head match between two agents.

### 2.2 Fight Card (Event)

A fight card is a set of matches presented together:

* prelims
* main card
* main event

This is a presentation concept; the harness can implement it as a structured schedule.

### 2.3 Round Robin (Early)

Useful for:

* benchmarking a pool of agents
* seeding brackets
* early “league table” standings

### 2.4 Single Elimination Bracket (Future)

Classic tournament format:

* winners advance
* losers eliminated

Requires seeding and tie-break policy.

### 2.5 Best-of Series

Best-of-N increases reliability and reduces variance.

Common values:

* Bo3 (best of 3)
* Bo5 (best of 5)

In a “UFC for Agents” presentation, best-of series can be marketed as “rounds.”

### 2.6 Teams (Future)

Team formats are scenario-dependent:

* 2v2 or 3v3 within a scenario
* team points aggregated across multiple 1v1 matches

## 3. Winners & Scoring

### 3.1 Match Scores

A scenario produces scores:

* `score: Record<AgentId, number>`

Higher score is better unless the scenario declares otherwise.

### 3.2 Winner Determination (Default)

If two agents have different final scores:

* higher score wins

If equal, the match is a **tie** at the match-runner level.

Tournament rules decide how ties are resolved.

## 4. “No Ties” Policy (Direction)

Product direction: **no ties** for official tournaments.

This section defines acceptable tie-break frameworks.

### 4.1 Tie-Break Framework Options (TBD)

1. **Best-of series**

   * repeat the match with new derived seeds
   * first to reach majority wins

2. **Sudden death**

   * extend the same match with additional turns
   * only allowed if scenario supports it cleanly

3. **Tie-break mini-round scenario**

   * run a short tie-break scenario designed to force separation

4. **Deterministic efficiency tie-break**

   * compare efficiency metrics derived from logs:

     * fewer turns
     * fewer invalid moves
     * lower time usage (future)
     * lower resource usage (future)

Policy must be mode- and scenario-specific.

### 4.2 Current Stance

* Official tournaments: no ties
* Exhibition: likely no ties, but exceptions allowed
* Sandbox: ties allowed

## 5. Seeding

Seeding orders competitors into brackets.

### 5.1 Seeding Inputs

Possible sources:

* prior tournament results
* round robin standings
* ELO-like rating (future)
* manual seeding for exhibition storylines (not for sanctioned ranked play)

### 5.2 Seeding Integrity

For sanctioned competition:

* seeding inputs should be transparent
* seed policy must be documented

## 6. Scheduling & Derived Seeds

Tournament scheduling must be deterministic when required.

* schedule order must be stable
* match seeds must be derived deterministically (see `tournament_harness_v0.md`)

For sanctioned play, seed anti-rigging policy is TBD (see `integrity_and_verification.md`).

## 7. Standings & Rankings

### 7.1 Standings (Event-Local)

A standings table for a single tournament/event, derived from match results.

Common fields:

* wins
* losses
* points for / against
* strength of schedule (future)

### 7.2 Rankings (Global)

A long-lived rating/leaderboard across events.

Policies TBD:

* rating algorithm (ELO/Glicko/etc)
* decay over time
* season resets

Official rankings must be separated from sandbox results.

## 8. Weight Classes / Budgets (Future)

To keep competition fair, official modes may define “weight classes” by resource budgets:

* time per turn
* memory cap
* tool usage constraints

Agents compete within the same class.

## 9. Disqualifications & Penalties (Future)

Tournament policy must define how to handle:

* timeouts
* crashes
* invalid actions
* rule violations (network use, tool use, etc)

Sanctioned play needs strict, transparent rules.

## 10. Presentation Hooks (UFC Feel)

These are show-layer concepts but influence tournament structure:

* fight cards
* rounds (best-of series)
* main events
* rivalries and rematches

The key rule: presentation must not compromise integrity for sanctioned matches.

## 11. Open Decisions

1. Final tie-break mechanisms by mode/scenario
2. Best-of defaults (Bo3 vs Bo5)
3. Seeding algorithm for official rankings
4. Weight classes and enforcement
5. Disqualification and penalty rules
