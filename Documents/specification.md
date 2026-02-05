# Contract v0 Specification

## 1. Identifiers

| Type     | TS Alias           | Format                                                   |
| -------- | ------------------ | -------------------------------------------------------- |
| Agent ID | `AgentId` (string) | Freeform, unique per match                               |
| Match ID | `MatchId` (string) | Generated from seeded RNG (`m_` + 12 alphanumeric chars) |
| Seed     | `Seed` (number)    | 32-bit integer                                           |

## 2. Interfaces

### Agent

```typescript
interface Agent<TObs, TAct> {
  readonly id: AgentId;
  init(config: AgentConfig): void;
  act(observation: TObs, ctx: AgentContext): TAct;
}
```

- `init` is called once before the match begins with the agent's id and a dedicated seed.
- `act` receives a scenario-specific observation and an `AgentContext` containing a per-agent seeded RNG, the current turn number, and the agent's id. Must return a scenario-specific action synchronously.

### Scenario

```typescript
interface Scenario<TState, TObs, TAct> {
  readonly name: string;
  init(seed: Seed, agentIds: AgentId[]): TState;
  observe(state: TState, agentId: AgentId): TObs;
  adjudicate(state: TState, agentId: AgentId, action: TAct): AdjudicationResult<TState>;
  isTerminal(state: TState): boolean;
  score(state: TState): Record<AgentId, number>;
  summarize(state: TState): JsonValue;
}
```

- `init` creates the initial game state from a seed and the list of participating agents.
- `observe` derives a per-agent view of the state (may hide information).
- `adjudicate` validates an action, applies it, and returns the new state plus feedback.
- `isTerminal` returns true when the match should end.
- `score` computes final scores keyed by agent id.
- `summarize` returns a JSON-serializable snapshot for the event log.

### MatchRunnerConfig

```typescript
interface MatchRunnerConfig {
  seed: Seed;
  maxTurns: number;
  matchId?: string;
}
```

## 3. Determinism Rules

1. All randomness MUST flow through `createRng(seed)` from `src/core/rng.ts`.
2. `Math.random` is **forbidden** on any simulation-critical path.
3. The master RNG is seeded from `config.seed`. Child seeds are derived deterministically for each agent and for the scenario.
4. Agent turn order is stable: agents are iterated in the order they are passed to `runMatch`.
5. Given identical `(seed, agents, scenario, maxTurns)`, `runMatch` MUST produce byte-identical event logs.

## 4. Event Model

Every event extends `BaseEvent`:

```typescript
interface BaseEvent {
  type: string; // discriminator
  seq: number; // 0-based, monotonically increasing
  matchId: MatchId;
}
```

### Event Types

| Type                 | Additional Fields                              | Emitted When               |
| -------------------- | ---------------------------------------------- | -------------------------- |
| `MatchStarted`       | `seed`, `agentIds`, `scenarioName`, `maxTurns` | Match begins               |
| `TurnStarted`        | `turn`                                         | Each turn begins           |
| `ObservationEmitted` | `agentId`, `turn`, `observation`               | Agent is about to act      |
| `ActionSubmitted`    | `agentId`, `turn`, `action`                    | Agent returns an action    |
| `ActionAdjudicated`  | `agentId`, `turn`, `valid`, `feedback`         | Scenario judges the action |
| `StateUpdated`       | `turn`, `summary`                              | End of each turn           |
| `AgentError`         | `agentId`, `turn`, `message`                   | Agent throws during `act`  |
| `MatchEnded`         | `reason`, `scores`, `turns`                    | Match finishes             |

### Serialization

- Every event MUST be `JSON.stringify`-able.
- No `undefined`, `NaN`, `Infinity`, or function values in events.
- Observation, action, and feedback fields carry `JsonValue` payloads.

## 5. Match Lifecycle

```
1. Create master RNG from config.seed
2. Generate matchId (or use config.matchId)
3. Derive per-agent seeds → init each agent
4. Derive scenario seed → init scenario state
5. Emit MatchStarted
6. LOOP while turn < maxTurns AND !isTerminal(state):
   a. turn++
   b. Emit TurnStarted
   c. FOR each agent (stable order):
      - observe(state, agentId) → emit ObservationEmitted
      - agent.act(obs, ctx) → emit ActionSubmitted
        (on error → emit AgentError, skip to next agent)
      - scenario.adjudicate(state, agentId, action) → emit ActionAdjudicated
      - update state
   d. Emit StateUpdated
7. Compute scores
8. Emit MatchEnded (reason: "completed" | "maxTurnsReached")
9. Return MatchResult
```

## 6. Scoring

Scoring is scenario-defined. The runner calls `scenario.score(state)` after the loop ends and includes the result in `MatchEnded`. There is no cross-scenario scoring in v0.

## 7. Error Handling

- If `agent.act()` throws, the runner emits an `AgentError` event with the error message and skips that agent for the current turn. The scenario decides (via its own state) whether to penalize.
- Invalid actions (adjudication returns `valid: false`) are logged via `ActionAdjudicated` with `valid: false`. The scenario controls the penalty.
- The runner never crashes due to agent errors; it always reaches `MatchEnded`.

## 8. Non-goals (v0)

- Tournament brackets or multi-match orchestration.
- Async or streaming agent interfaces.
- Network transport or remote agents.
- Persistent storage or databases.
- Spectator/replay UI.
