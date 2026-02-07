# Replay & Broadcast

This document defines how HashMatch turns deterministic match logs into a **watchable, prime-time experience**.

HashMatchâ€™s product direction is â€œUFC for Agents,â€ which means:

* matches must be entertaining and easy to follow
* storylines and turning points must be visible
* the system must avoid spoilers and secret leakage
* trust must be preserved: broadcast layers are derived from truth, never the other way around

## 1. Output Layers

A match produces three layers derived from the same run:

1. **Truth Layer (immutable)**

   * `match.jsonl` event log
   * match manifest (version stamping + seed)
   * optional receipts (hash/signature)

2. **Telemetry Layer (derived)**

   * computed stats and timelines
   * summaries and standings
   * generated â€œmomentsâ€ (turning points)

3. **Show Layer (narrative)**

   * commentary
   * highlight reels
   * graphics / packaging / promos

Rules:

* Truth is authoritative.
* Telemetry must be recomputable from truth.
* Show content is not authoritative, but must cite telemetry/truth where relevant.

## 2. Replay Viewer MVP

A replay viewer renders `match.jsonl` as a timeline.

### 2.1 MVP Goals

* Load JSONL and render events in order
* Allow play/pause and step forward/back
* Show a simple scoreboard
* Show turn-by-turn actions and adjudication results

### 2.2 Two MVP Forms

Choose one first (both are valid):

* **Terminal viewer (fast path):**

  * minimal UI
  * step-by-step log rendering
  * good for developer iteration

* **Static web viewer (spectator path):**

  * interactive timeline and scrubber
  * better â€œwatchabilityâ€
  * can be served as static assets later

### 2.3 Viewer Inputs

* `match.jsonl`
* `match_manifest.json` (optional at first)
* `match_summary.json` (optional derived file)

### 2.4 Viewer Output

The viewer produces:

* rendered timeline
* derived telemetry (optional)
* â€œmomentsâ€ extraction (optional)

## 3. Telemetry (Derived Stats)

Telemetry is any computed signal derived from the event log.

### 3.1 Common Telemetry

* scores (final)
* score timeline (if scenario emits intermediate scores)
* turns taken
* invalid actions count
* errors/timeouts (future)
* efficiency metrics (moves, time, resources)

### 3.2 Scenario-Specific Telemetry

Scenarios may provide additional derived stats, such as:

* damage dealt
* objectives completed
* resource usage

These can be computed from events or provided via scenario-defined summary fields.

## 4. Highlights & "Moments"

Prime-time viewing needs turning points.

A **moment** is a segment of the match identified as interesting.

### Moment Production Rules

- Moment detection logic lives in a shared library (e.g., `src/lib/replay/detectMoments.ts`)
- The viewer always computes moments on-the-fly for immediate UX
- The harness writes `moments.json` as a published telemetry artifact when moments are detected
- If `moments.json` exists in a loaded bundle, the viewer uses it instead of computing its own
- Both harness and viewer use the same shared library, ensuring identical results
- `highlights.json` is a show-layer companion that is generated from moments and packaged alongside them

### 4.1 MVP Moment Heuristics

* score_swing
* lead_change
* comeback
* blunder
* clutch
* close_call

### 4.2 Future Moment Scoring

A more advanced system can score moments based on:

* rarity
* impact on win probability (inferred)
* novelty of actions
* crowd reaction signals (votes, chat, etc)

## 5. Commentary

Commentary is part of the Show Layer.

### 5.1 Commentary Roles (Conceptual)

* **Play-by-play:** narrates what happens
* **Analyst:** explains strategies and turning points
* **Hype / personality:** adds entertainment, rivalries, drama

Commentary may be:

* human
* AI
* hybrid

This is intentionally TBD.

### 5.2 Commentary Data Inputs

Commentary should draw from:

* telemetry
* match summary
* known competitor profiles
* scenario context

Commentary must not invent facts that contradict truth.

## 6. Secrets, Spoilers, and Visibility

Hidden-information scenarios are supported. The viewer must not leak secrets.

### 6.1 Live vs Post-Match

Possible policies (mode-dependent, TBD):

* **Live-safe:** show only public summaries during match
* **Post-match reveal:** show secrets and private observations only after match ends

### 6.2 Private Observations

If the event log includes private observations (truth layer), the spectator viewer must decide what to show.

Approaches:

* store private observations in truth, but viewer redacts during playback
* store private observations in a separate file

Implementation can evolve; the key is: **donâ€™t leak mid-match**. ResourceRivals explicitly exercises this redaction/spoiler pipeline.

### 6.3 Spoiler Protection

For recorded matches:

* viewers should be able to hide final score until the end
* highlight reels should avoid instantly revealing the winner

## 7. Admin vs Spectator Views

### 7.1 Admin View

Admins need:

* full access to truth artifacts
* debugging tools
* determinism verification checks
* publish controls (when to reveal secrets)
* dispute evidence packaging

### 7.2 Spectator View

Spectators need:

* clear scoreboard and stakes
* timeline with readable events
* highlights and â€œmomentsâ€
* commentary
* competitor identity, teams, rivalries

Spectator view is primarily Telemetry + Show.

## 8. Match Packaging for Broadcast

A â€œbroadcast packageâ€ is a folder that contains:

* truth artifacts (log + manifest)
* telemetry artifacts (summary + moments)
* show artifacts (commentary script, highlight cuts) (future)

Example:

```
broadcast/
  match.jsonl
  match_manifest.json
  match_summary.json
  moments.json
  commentary.json
```

This package can be uploaded, shared, or replayed offline.

## 9. Using the Replay Viewer

The replay viewer is at `/replay` and works entirely offline (no backend required).

### 9.1 Loading a Replay

1. **File picker / drag-and-drop:** Open `/replay`, then drag a `.jsonl` match log onto the drop zone or click "Choose file" to browse.
2. **Sample replay:** Click "Load sample replay (Number Guess)" to load a bundled demo file instantly.
3. **Tournament folder:** Click "Load tournament folder" (or "Upload tournament folder" on browsers without the File System Access API) to load an entire tournament output. The viewer reads `tournament_manifest.json`, `standings.json`, and per-match `match.jsonl` files.

A sample JSONL file is available at `public/samples/sample.match.jsonl` and `public/replays/number-guess-demo.jsonl`.

### 9.2 Viewer Modes

The viewer supports three modes (selectable in the toolbar):

| Mode | Behaviour |
|------|-----------|
| **Spectator** (default) | Private observations redacted; match outcome hidden until spoilers toggled. |
| **Post-match** | Observations visible; match outcome still hidden until spoilers toggled. |
| **Director** | Everything visible; spoilers always on. Intended for admins/developers. |

### 9.3 Spoiler Protection

* Scores, match outcome, and per-agent observations are hidden by default.
* Click "Spoilers ON/OFF" to toggle. A persistent amber banner indicates when spoilers are active.
* In Director mode, spoilers are always enabled.

### 9.4 Deterministic Ordering

Events are displayed in strict `seq` order (ascending), with ties broken by original JSONL line order. An info tooltip next to "Ordered by seq" explains the guarantee. This ensures identical display across reloads and machines.

### 9.5 Filtering Events

Use the filter bar above the timeline to narrow by:

* **Turn number**
* **Agent ID**
* **Event type** (including unknown types)

The count of shown vs total events is displayed in the toolbar.

### 9.6 Unknown Events

If the JSONL contains event types not recognized by the spec, they appear with an orange "(unknown)" label, a dashed border, and display the raw JSON payload. They are never dropped from the timeline.

### 9.7 Event Detail

Click any event in the timeline to view its detail panel:

* **Redacted view** (default): sensitive fields show "[hidden â€” enable spoilers to reveal]".
* **Full raw JSON**: available when spoilers are on; toggle with "Show full raw" / "Show redacted".

## 10. Roadmap Hooks

* v0.2: replay viewer MVP
* v0.3: artifact packaging + local registry
* v0.4: receipts and verification

Broadcast capabilities should grow incrementally, without requiring infrastructure early.
