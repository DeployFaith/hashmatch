# Heist Game Contract v0

## 1. Overview

Heist is a stealth/objective game framework for HashMatch. An agent starts at spawn, must acquire objective items (via hacking terminals, finding keycards), retrieve the objective from a vault, and reach extraction — all while avoiding guards, cameras, and alarm escalation.

The framework is designed for reskinning. The same mechanics support: prison break, museum heist, corporate infiltration, data center raid, and other stealth/objective themes. The skin is cosmetic — the rules engine is identical across variants.

## 2. Action Space

Five action types per turn (see `HeistAction` in `src/games/heist/types.ts`):

- **`{ type: "move", toRoomId: string }`** — Move to an adjacent room via a connecting door. Fails if no door connects current room to target or if the door is locked and the agent lacks the required item.

- **`{ type: "pickup", itemId: string }`** — Pick up an item in the current room. Adds the item to inventory. Loot items add `scoreValue × lootMultiplier` to the agent's score.

- **`{ type: "use_terminal", terminalId: string }`** — Hack a terminal in the current room. Multi-turn progress: each use increments progress by 1. When progress reaches `hackTurns`, the terminal is hacked and grants its `successGrants` items (intel) to the agent.

- **`{ type: "extract" }`** — Extract from the extraction room. Agent must be in the designated extraction room. Marks the agent as extracted.

- **`{ type: "wait" }`** — Pass turn. No noise generated. Burns a turn from the budget.

> **Note:** The original spec described `interact(targetEntityId, using?)` and `use_item(itemId)` as generic verbs. The implementation replaced these with specific action types (`pickup`, `use_terminal`, `extract`) for clarity and type safety.

## 3. Observation Model

The agent receives per turn (see `HeistObservation` in `src/scenarios/heist/index.ts`):

- `currentRoomId` — the room the agent is currently in
- `adjacentRooms` — array of `{ roomId, doorId, locked, requiredItem?, passable }` for each connecting door
- `visibleItems` — items present in the current room (full `HeistItem` objects)
- `visibleEntities` — entities in the current room (excludes guards)
- `inventory` — array of `{ itemId, type }` for items the agent is carrying
- `turn` — current turn number
- `_private` fields:
  - `map` — full map (rooms + doors)
  - `entities` — all entities
  - `items` — all items
  - `alertLevel` — current alert level
  - `extractionRoomId` — room ID needed for extraction
  - `terminalProgress` — hack progress per terminal
  - `terminalHacked` — hack completion status per terminal
  - `invalidActionFallback?` — optional fallback action from rules

**Visibility rules:** The agent sees only items and entities in its current room. Guards are excluded from `visibleEntities`. Adjacent rooms are visible only as door connections (the agent knows which rooms are connected but not their contents).

**Spectator view:** The `_private` block contains the full map, all entities, and all items — hidden during live spectator play and revealed post-match via `reveal()`.

## 4. Tension Model (Noise → Alert)

- The `rules.noiseTable` defines noise values per action type and `rules.alertThresholds` defines alert level boundaries.
- `rules.noiseDecayRate` allows noise to decay per turn.
- `rules.maxAlertLevel` caps the alert level.
- `rules.captureOnMaxAlert` controls whether max alert ends the match immediately.

**v0 implementation note:** In the current scenario code (`src/scenarios/heist/index.ts`), the alert level is incremented directly on invalid actions (not via noise accumulation). The `noiseTable` and `alertThresholds` are defined in params but the scenario does not yet implement per-action noise tracking — invalid actions bump `alertLevel` by 1 (capped at `maxAlertLevel`). The default params set `captureOnMaxAlert: false`, so max alert does not end the match. The `isTerminal` check uses `winCondition.maxTurns` and extraction status, not alert level.

## 5. Guard Behavior

Guards are deterministic state machines, **not** competing agents.

- **Patrol route:** Ordered list of room IDs (cyclic). Guard position is computed as `patrolRoute[turn % patrolRoute.length]`.
- **Detection model:** `detectionRange` is defined per guard but detection/pursuit is not yet implemented in the v0 scenario code. Guards are positional data only — their positions are tracked in `summarize()` output for spectator telemetry.
- **Alert response:** The `alertResponse` field is defined in guard entity types but not yet implemented — guards do not change behavior based on alert level in v0.
- **Visibility:** Guards are excluded from the agent's `visibleEntities` observation. Guard positions are included in the `StateUpdated` summary for spectator view.

> **Note:** Guard pursuit, detection triggering, and alert-responsive behavior are specified for future versions. The current implementation tracks guard positions for display but does not implement active detection or pursuit mechanics.

## 6. Interaction Rules (Implemented)

The original spec described a generic `interact(entityId, using?)` action resolved via an interaction table. The implementation uses specific action types instead. Here is how each interaction works in the current code:

| Action                             | Target          | Behavior                                                                                          |
| ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `{ type: "move", toRoomId }`       | Adjacent room   | Moves agent if a door connects rooms and door is passable (unlocked or agent has `requiredItem`)  |
| `{ type: "pickup", itemId }`       | Item in room    | Picks up item; loot items add `scoreValue × lootMultiplier` to score                             |
| `{ type: "use_terminal", terminalId }` | Terminal in room | Increments hack progress; when progress >= `hackTurns`, grants `successGrants` items          |
| `{ type: "extract" }`             | Extraction room | Marks agent as extracted; must be in `winCondition.extractionRoomId`                              |
| `{ type: "wait" }`                | —               | No-op; advances turn                                                                              |

**Invalid actions** result in an `alertLevel` increment (capped at `maxAlertLevel`) and a score penalty of `scoring.invalidActionPenalty`.

**Door passability:** A door is passable if it has a `requiredItem` and the agent holds that item, or if it is not locked. A locked door with no `requiredItem` is impassable.

## 7. Win Conditions & Scoring

**Primary win condition:** Reach the extraction room while holding all required objective items.

**Failure conditions:**

- Turns exhausted (time out)
- Alert hits max level (capture/lockdown)

**Scoring** (for ranking beyond binary win/loss):

| Component                  | Value                           | Purpose               |
| -------------------------- | ------------------------------- | --------------------- |
| `objectiveSecured`         | Large fixed points (e.g., 1000) | Primary goal          |
| `extractionBonus`          | Fixed points (e.g., 500)        | Completed the mission |
| `turnsRemainingMultiplier` | `turnsLeft × N`                 | Rewards efficiency    |
| `lootMultiplier`           | `loot.scoreValue × multiplier`  | Optional side goals   |
| `alertPenaltyPerLevel`     | Negative per alert level at end | Penalizes sloppiness  |
| `invalidActionPenalty`     | Negative per invalid action     | Penalizes bad play    |

Scoring weights are tunable per scenario preset. Defaults are locked in code.

## 8. Broadcast / Watchability

**Headline metrics** (always visible to spectators):

- Alert level — tension meter (the "health bar equivalent")
- Objectives: X/Y secured
- Turns remaining — the clock
- Rooms explored: X/N

**Moment hooks** (for `moments.json` and commentary):

| Moment ID           | Trigger                                               |
| ------------------- | ----------------------------------------------------- |
| `alert_escalation`  | Any event bumping alert level                         |
| `near_miss`         | Agent adjacent to guard, no detection                 |
| `vault_cracked`     | Major objective event (vault opened)                  |
| `blunder`           | Invalid action or failed interaction triggering alarm |
| `clutch_extraction` | Objective + extraction with ≤3 turns remaining        |
| `speed_run`         | Extraction in <40% of turn budget                     |

## 9. Map Generation (Procedural)

Room graph approach: nodes = rooms, edges = doors.

**Generation algorithm:**

1. Generate room graph (N rooms, target branchiness from config).
2. Assign room types: `spawn`, `vault`, `extraction`, `security`, `utility`, `hallway`, `decoy`.
3. Place doors with properties: `locked`, `alarmed`, `keycardLevel`, `noiseOnForce`.
4. Place entities (guards, cameras, terminals, vault) and items (keycards, tools, loot).
5. Validate (see §10).
6. If invalid, increment seed offset and retry (max attempts configurable).
7. Output: `scenario.json` with all data in the params blob.

**IMPORTANT:** Doors are the source of truth for room adjacency. Rooms do **not** independently declare an `adjacent` array. Adjacency is derived from the door list — a room is adjacent to another room if and only if a door connects them.

## 10. Validation Constraints

Generated maps must satisfy all of the following:

- **Reachability (spawn → vault):** BFS confirms a path exists using only obtainable keys/items.
- **Reachability (vault → extraction):** BFS confirms a path exists post-vault.
- **No hard-locks:** Every required item is reachable without passing through the lock it opens. The item dependency graph must be a DAG with no cycles.
- **Solvable:** Shortest viable path < `maxTurns` (the map can be completed in time).
- **Non-trivial:** Shortest viable path > `maxTurns × 0.3` (the map isn't a walkthrough).
- **Branching:** ≥2 distinct paths from spawn → vault (tunable per config).

## 11. Generator Knobs

| Knob                  | Values / Range                                | Notes                             |
| --------------------- | --------------------------------------------- | --------------------------------- |
| `rooms`               | min/max count, branchiness                    | Controls map size and complexity  |
| `security`            | guards on/off + count, cameras on/off + count | Threat density                    |
| `hazards`             | on/off + severity                             | Environmental dangers             |
| `timeLimit`           | strict / lenient (`maxTurns`)                 | Turn budget                       |
| `loot`                | none / low / medium / high                    | Optional side objectives          |
| `tools`               | allowed / forbidden                           | May be division-dependent         |
| `objectiveComplexity` | Number of code fragments required             | Vault unlock requirements         |
| `difficultyPresets`   | easy / medium / hard                          | Composite presets combining above |

## 12. Params Schema

The params blob lives inside `scenario.json.params` and contains:

- **`map`** — rooms (id, type, position?, properties?) + doors (id, roomA, roomB, locked?, requiredItem?, alarmed?, noiseOnForce?)
- **`entities`** — guards (id, patrolRoute, detectionRange, alertResponse?), cameras (id, roomId, range, disabled?), terminals (id, roomId, hackTurns, alarmOnFail?, successGrants?), vault (id, roomId, requiredItems)
- **`items`** — keycards (id, roomId, level?), tools (id, roomId, toolType, uses?), loot (id, roomId, scoreValue), intel (id, label? — no roomId, granted by terminal `successGrants`)
- **`rules`** — noiseTable (action → noise value), alertThresholds array, noiseDecayRate, guardDetectionRange?, maxAlertLevel, captureOnMaxAlert, invalidActionFallback?
- **`scoring`** — objectiveSecured, extractionBonus, turnsRemainingMultiplier, lootMultiplier, alertPenaltyPerLevel, invalidActionPenalty
- **`winCondition`** — requiredObjectives list, extractionRoomId, maxTurns, maxAlertLevel
- **`skin`** — theme name, room display names, entity display names, flavor text

TypeScript types will be defined in `src/games/heist/types.ts`.

**Key schema decisions:**

- Doors are the adjacency source of truth (rooms don't declare adjacent).
- Code fragments / hack outputs are items with type `"intel"` (no `roomId` — granted by terminal `successGrants`).
- Noise/alert model: thresholds array, decay rate, maxAlertLevel, and captureOnMaxAlert are all explicit in params. Note: per-action noise tracking is defined in params but not yet implemented in the scenario — alert level currently increments only on invalid actions.

## 13. Open Decisions (resolve in code)

- **Detection model:** Range-only in v0. Directional cones deferred to v1+.
- **Multi-agent:** Solo (agent vs environment) for v0. Parallel competition (two agents independently, same map, compare scores) implemented via `src/engine/heistCompetitive.ts`.
- **Stealth:** Implicit via `wait` + room cover properties in v0. Explicit `hide` action in v1+.
- **Scoring weights:** Tunable per preset. Lock defaults in code — presets override.

## 14. Implementation Status (Repo Audit)

Last audited: 2026-02-08

The Heist game framework is **fully implemented**.

| Component                                        | Status | Evidence                                                        |
| ------------------------------------------------ | ------ | --------------------------------------------------------------- |
| Params schema + TypeScript types                 | ✅     | `src/games/heist/types.ts`, `src/games/heist/generatorTypes.ts` |
| Procedural map generator                         | ✅     | `src/games/heist/generator.ts`                                  |
| Validator (BFS reachability + dependency DAG)    | ✅     | `src/games/heist/validator.ts`, `src/games/heist/validation.ts` |
| Preview (ASCII minimap + text description)       | ✅     | `src/games/heist/preview.ts`                                    |
| Heist scenario (game rules + scoring)            | ✅     | `src/scenarios/heist/index.ts`                                  |
| Heist competitive runner                         | ✅     | `src/engine/heistCompetitive.ts`                                |
| CLI: `scenario gen\|validate\|preview\|describe` | ✅     | `src/cli/scenario.ts`                                           |
| Curated presets (3 themes × 3 seeds)             | ✅     | `scenarios/heist/` (9 files)                                    |
| Ollama LLM agent adapter                         | ✅     | `src/agents/ollama/heistAdapter.ts`                             |
| Tests                                            | ✅     | 13 files: `tests/heist*.test.ts` (including competitive runner, decoder, spatial layout, scene reducer, spectator telemetry) |

### Differences from this spec

| Spec                                                    | Actual                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript types in `src/games/heist/types.ts` (§12)    | Implemented as specified                                                                       |
| CLI uses `hm scenario` (§12)                            | CLI uses `src/cli/scenario.ts` invoked via `npm run build:engine && node dist/cli/scenario.js` |
| Multi-agent parallel competition (§13, v1)              | Implemented in `src/engine/heistCompetitive.ts` (`combineHeistRuns()`)                         |
| Difficulty presets: easy/medium/hard (§11)              | Implemented as easy/normal/hard/expert in generator                                            |
| Action space: `interact` + `use_item` verbs (§2)       | Replaced by specific actions: `pickup`, `use_terminal`, `extract` (§2 updated)                 |
| Observation fields: `location`, `visibleRooms` (§3)    | Implemented as `currentRoomId`, `adjacentRooms`, `visibleItems` (§3 updated)                   |
| Guard detection/pursuit mechanics (§5)                  | Guards are positional data only; detection/pursuit not yet implemented                          |
| Per-action noise tracking (§4)                          | Noise params defined but alert only increments on invalid actions                               |
| Door `keycardLevel` field (§12)                         | Implemented as `requiredItem` (item ID string, not numeric level)                               |
