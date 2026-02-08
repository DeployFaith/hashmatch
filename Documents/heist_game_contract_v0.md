# Heist Game Contract v0

## 1. Overview

Heist is a stealth/objective game framework for HashMatch. An agent starts at spawn, must acquire objective items (via hacking terminals, finding keycards), retrieve the objective from a vault, and reach extraction — all while avoiding guards, cameras, and alarm escalation.

The framework is designed for reskinning. The same mechanics support: prison break, museum heist, corporate infiltration, data center raid, and other stealth/objective themes. The skin is cosmetic — the rules engine is identical across variants.

## 2. Action Space

Four action types per turn:

- **`move(targetRoomId)`** — Move to an adjacent room. Generates noise based on room properties and door type. Fails if no door connects current room to target.

- **`interact(targetEntityId, using?: itemId)`** — General-purpose verb. Resolution depends on entity type + item held:
  - Pick lock, hack terminal, open vault, disable camera, grab loot.
  - See §6 (Entity Interaction Table) for full resolution rules.

- **`use_item(itemId)`** — Room-wide or global effect (EMP, smoke grenade). Distinct from `interact`: `interact` targets a specific entity, `use_item` affects the environment or room.

- **`wait`** — Pass turn. May have stealth benefit (lower noise generation). Burns a turn from the budget.

## 3. Observation Model

The agent receives per turn:

- `location` (RoomId)
- `visibleRooms` — adjacent rooms + rooms through open/transparent doors, per fog rules
- `visibleEntities` — entities in visible rooms
- `inventory` — items currently held
- `turnsRemaining` — turns left in the match
- `alertLevel` (0–3) — current alarm state
- `objectives` — status of each objective (pending/secured)
- `_private` fields:
  - `noiseLevel` — current accumulated noise
  - `detectionRisk` — proximity-based risk metric
  - `hackProgress` — partial progress on multi-turn hacks

**Visibility rules:** Default fog = adjacent rooms + rooms through open/transparent doors. Guards are visible only if in visible rooms. Cameras are visible only if in visible rooms.

**Spectator view:** Full map + guard patrol routes visible at all times. This creates a "horror movie" effect — the audience sees danger before the agent does. Agent `_private` fields are hidden during live play and revealed post-match via `reveal()`.

## 4. Tension Model (Noise → Alert)

- Actions generate noise (numeric value per action type, modified by items/context).
- Noise accumulates per turn. Alert level is determined by threshold crossings.
- Alert thresholds are defined in scenario params (e.g., `[0, 3, 6, 10]` for levels 0–3).
- Optional noise decay per turn — tension can ebb, not just ratchet upward.
- Max alert (level 3) = capture/lockdown — match ends immediately.

**v0 design decision:** Alert level is computed from current noise (with decay), so tension can ebb and flow rather than monotonically increasing. Current noise decays by `noiseDecayRate` per turn. Alert level = max threshold index where current noise >= threshold value.

## 5. Guard Behavior

Guards are deterministic state machines, **not** competing agents.

- **Patrol route:** Ordered list of room IDs (cyclic). Guard advances one step per turn during normal patrol.
- **Detection model:** Range-based in v0 — detection radius measured in rooms (0 = same room only, 1 = adjacent rooms, etc.). Directional cones deferred to v1+.
- **Alert response:** Behavior changes with alert level:
  - Level 0–1: Continue patrol (hold)
  - Level 2: Pursue — move toward last known noise source
  - Level 3: Call backup — all guards converge on agent location (lockdown)
- **Determinism:** All guard movement and detection events are written to the truth log. Guard behavior is fully deterministic given the scenario params and game state.

## 6. Entity Interaction Table

All interactions resolve deterministically based on entity type + item used. The table is data-authorable — scenario params define which entities exist, required items, and side effects.

| Entity      | Item Used          | Result                                          |
| ----------- | ------------------ | ----------------------------------------------- |
| Locked door | Matching keycard   | Opens (no noise)                                |
| Locked door | Lockpick           | Opens (noise generated)                         |
| Locked door | Nothing            | Fail + penalty noise                            |
| Terminal    | Nothing            | Hack attempt (multi-turn progress bar or alarm) |
| Vault       | Required code item | Opens (high noise)                              |
| Camera      | EMP                | Disabled for N turns                            |
| Camera      | Nothing            | Fail — no effect, agent detected if in range    |
| Guard       | Nothing            | Fail → immediate alert escalation               |
| Loot item   | Nothing            | Picked up, added to inventory                   |
| Keycard     | Nothing            | Picked up, added to inventory                   |
| Tool (EMP)  | Nothing            | Picked up, added to inventory                   |

Additional interactions may be defined per scenario via the params blob. The engine resolves interactions by looking up `(entityType, itemId | null)` in the interaction table.

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

- **`map`** — rooms (id, type, properties) + doors (id, roomA, roomB, locked, keycardLevel, alarmed, noiseOnForce)
- **`entities`** — guards (id, patrolRoute, detectionRange, alertResponse), cameras (id, roomId, range, disabled), terminals (id, roomId, hackTurns, alarmOnFail), vault (id, roomId, requiredItems)
- **`items`** — keycards (id, roomId, level), tools (id, roomId, type, uses), loot (id, roomId, scoreValue), intel (id, grantedBy — no room spawn, granted by terminal interaction)
- **`rules`** — noiseTable (action → noise value), alertThresholds array, noiseDecayRate, guardDetectionRange
- **`scoring`** — objectiveSecured, extractionBonus, turnsRemainingMultiplier, lootMultiplier, alertPenaltyPerLevel, invalidActionPenalty
- **`winCondition`** — requiredObjectives list, extractionRoomId, maxTurns, maxAlertLevel
- **`skin`** — theme name, room display names, entity display names, flavor text

TypeScript types will be defined in `src/games/heist/types.ts`.

**Key schema decisions:**

- Doors are the adjacency source of truth (rooms don't declare adjacent).
- Code fragments / hack outputs are items with type `"intel"` (no room spawn — granted by terminal interaction).
- Noise/alert model: thresholds array, decay rate, and cumulative tracking are all explicit in params.

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

| Spec                                                 | Actual                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript types in `src/games/heist/types.ts` (§12) | Implemented as specified                                                                       |
| CLI uses `hm scenario` (§12)                         | CLI uses `src/cli/scenario.ts` invoked via `npm run build:engine && node dist/cli/scenario.js` |
| Multi-agent parallel competition (§13, v1)           | Implemented in `src/engine/heistCompetitive.ts` (`combineHeistRuns()`)                         |
| Difficulty presets: easy/medium/hard (§11)           | Implemented as easy/normal/hard/expert in generator                                            |
