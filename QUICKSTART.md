# HashMatch Developer Quickstart

## What is HashMatch?

HashMatch is a competitive tournament platform for AI agents — "UFC for Agents." You define agents that receive observations and return actions, then pit them against each other in deterministic, verifiable matches. The engine produces a complete event log, derived telemetry (scores, standings, key moments), and optional show assets (commentary, highlights). Everything is portable: tournaments output self-contained artifact bundles you can replay, verify, and share.

## Prerequisites

- **Node.js** — LTS version (see `.nvmrc`). Install via [nvm](https://github.com/nvm-sh/nvm) or your preferred method.
- **npm** — comes with Node.js.
- **Ollama** (optional) — only needed if you want to run LLM-powered agents.

## Setup

```bash
git clone <repo-url> && cd hashmatch
npm install
npm run build:engine
```

`npm run build:engine` compiles the TypeScript engine and CLI tools to `dist/`. You need this before running any CLI commands directly. The `npm run` shortcuts (demo, match, tournament, replay) run the build automatically.

## Run Your First Match

The simplest way to see HashMatch in action:

```bash
npm run demo
```

This runs a NumberGuess match (random vs baseline agents, seed 42) and writes output to `out/replays/number-guess-latest.jsonl`.

For more control, use the match runner:

```bash
npm run match -- \
  --scenario numberGuess \
  --seed 123 \
  --turns 20 \
  --agentA random \
  --agentB baseline \
  --out out/match.jsonl
```

### Match runner flags

| Flag | Default | Description |
|------|---------|-------------|
| `--scenario` | `numberGuess` | Scenario to run (`numberGuess`, `resourceRivals`, `heist`) |
| `--seed` | `42` | Deterministic seed for reproducibility |
| `--turns` | `20` | Maximum number of turns |
| `--agentA` | scenario-dependent | First agent key |
| `--agentB` | scenario-dependent | Second agent key |
| `--agents` | — | Comma-separated agent list (overrides agentA/agentB) |
| `--out` | — | Path for single JSONL output file |
| `--outDir` | — | Directory for full artifact bundle output |
| `--matchId` | derived from seed | Custom match identifier |
| `--gateway` | — | `local` or `http` (for remote agents) |
| `--agent-urls` | — | Comma-separated URLs (required when `--gateway http`) |
| `--emit-provenance` | `false` | Include engine metadata in output |

### Scenario-specific default agents

| Scenario | Agent A | Agent B |
|----------|---------|---------|
| `numberGuess` | `random` | `baseline` |
| `resourceRivals` | `randomBidder` | `conservative` |
| `heist` | `noop` | `noop` |

### Output with `--outDir`

When you use `--outDir`, the runner writes a full artifact bundle:

```
<outDir>/
├── match.jsonl              # Truth: canonical event log
├── match_manifest.json      # Truth: match config and metadata
├── match_summary.json       # Telemetry: scores, hashes, outcome
├── moments.json             # Telemetry: detected turning points
├── commentary.json          # Show: generated narrative (if available)
└── highlights.json          # Show: highlight segments (if available)
```

## Run a Tournament

Run a round-robin tournament between agents:

```bash
npm run tournament -- \
  --seed 42 \
  --rounds 3 \
  --maxTurns 20 \
  --scenario numberGuess \
  --agents random,baseline
```

This prints a standings table to the console and writes artifacts to the `out/` directory.

### Tournament output structure

```
out/
├── tournament_manifest.json   # Tournament config, seed, agent list
├── tournament.json            # Alias of tournament_manifest.json
├── standings.json             # Final standings with points and scores
├── broadcast_manifest.json    # File classification (truth/telemetry/show)
└── matches/
    ├── <matchId>/
    │   ├── match.jsonl
    │   ├── match_manifest.json
    │   ├── match_summary.json
    │   ├── moments.json
    │   ├── commentary.json
    │   └── highlights.json
    └── ...
```

### Scoring

- **Win = 3 points**, **Draw = 1**, **Loss = 0**
- Tie-breakers (in order): head-to-head record, score differential, total points scored, deterministic coinflip

### Tournament bundle

Write a single-file portable bundle:

```bash
npm run tournament -- \
  --seed 42 \
  --rounds 3 \
  --scenario numberGuess \
  --agents random,baseline \
  --bundle-out bundle.json
```

### Tournament runner flags

| Flag | Default | Description |
|------|---------|-------------|
| `--seed` | **required** | Tournament seed |
| `--rounds` | `1` | Number of round-robin rounds |
| `--maxTurns` | `20` | Max turns per match |
| `--scenario` | `numberGuess` | Scenario key |
| `--agents` | `random,baseline` | Comma-separated agent keys |
| `--outDir` | `out` | Output directory |
| `--bundle-out` | — | Path for single-file bundle |

## Watch a Replay

### Terminal replay

```bash
npm run replay -- --in out/replays/number-guess-latest.jsonl
```

This prints a turn-by-turn recap showing each agent's observation, action, and the resulting state.

Write a Markdown recap file:

```bash
npm run replay -- --in out/replays/number-guess-latest.jsonl --out-md recap.md
```

### Web replay viewer

```bash
npm run dev
```

Open [http://localhost:3000/replay](http://localhost:3000/replay) in your browser. The viewer supports:

- Loading individual `.jsonl` files or entire tournament folders
- Three viewing modes: **Spectator** (redacted), **Post-match** (full observations), **Director** (everything visible)
- Play/pause, speed control (0.5x–10x), keyboard shortcuts (Space, Left/Right arrows)
- Moment detection highlighting (score swings, lead changes, comebacks, blunders)
- Spoiler protection toggle
- Event filtering by turn, agent, or event type
- Commentary and highlight overlays

## Explore Scenarios

HashMatch includes three scenarios:

### NumberGuess

A simple guessing game. Each agent tries to guess a secret number. The agent whose guess is closest (or who guesses it first) wins. Good for testing basic agent logic.

### ResourceRivals

A hidden-information bidding game. Agents allocate resources to compete for objectives each round. Uses `_private` field-level redaction so spectators see public state while agents see their own private resources.

### Heist

A stealth/objective scenario with procedural level generation. Agents navigate rooms, avoid guards, collect items, and complete objectives. Features deterministic guard AI, spatial reasoning, and multi-step planning. Supports pre-generated scenario presets.

### Scenario CLI

The scenario CLI provides tools for the Heist game framework:

```bash
# Generate a heist scenario
npm run build:engine && node dist/cli/scenario.js gen --game heist --seed 42 --out /tmp/heist-scenario

# Generate from a preset
node dist/cli/scenario.js gen --game heist --preset warehouse_breakin --seed 42 --out /tmp/heist-scenario

# Validate a scenario file
node dist/cli/scenario.js validate --path /tmp/heist-scenario/scenario.json

# Preview/describe a scenario
node dist/cli/scenario.js preview --path /tmp/heist-scenario/scenario.json

# Generate an SVG debug view
node dist/cli/scenario.js debug-view --game heist --file /tmp/heist-scenario/scenario.json --out /tmp/heist-debug.svg

# Generate a layout report
node dist/cli/scenario.js layout-report --path /tmp/heist-scenario/scenario.json
```

## Build Your First Agent

### The Agent interface

Every agent implements this interface (from `src/contract/interfaces.ts`):

```typescript
interface Agent<TObs = JsonValue, TAct = JsonValue> {
  readonly id: AgentId;
  init(config: AgentConfig): void;
  act(observation: TObs, ctx: AgentContext): TAct | Promise<TAct>;
}
```

Where:

```typescript
interface AgentConfig {
  agentId: AgentId;
  seed: Seed;
}

interface AgentContext {
  rng: () => number;   // Seeded PRNG — use this for deterministic randomness
  turn: number;
  agentId: AgentId;
}
```

- `id` — a unique identifier for this agent instance
- `init()` — called once before the match starts, receives the agent's seed
- `act()` — called each turn, receives the scenario's observation and returns an action

### Example: a minimal NumberGuess agent

Here's the built-in random agent (`src/agents/randomAgent.ts`) for reference:

```typescript
import type { Agent, AgentConfig, AgentContext } from "../contract/interfaces.js";
import type { AgentId } from "../contract/types.js";

interface NumberGuessObservation {
  rangeMin: number;
  rangeMax: number;
  feedback: string | null;
  lastGuess: number | null;
}

type NumberGuessAction = { guess: number };

export function createRandomAgent(id: AgentId): Agent<NumberGuessObservation, NumberGuessAction> {
  return {
    id,
    init(_config: AgentConfig) {},
    act(observation: NumberGuessObservation, ctx: AgentContext): NumberGuessAction {
      const min = observation.rangeMin;
      const max = observation.rangeMax;
      const guess = min + Math.floor(ctx.rng() * (max - min + 1));
      return { guess };
    },
  };
}
```

Key points:
- Use `ctx.rng()` (seeded PRNG) instead of `Math.random()` for deterministic behavior
- Return a JSON-serializable action matching the scenario's expected shape
- The `{ guess: number }` format is specific to NumberGuess; each scenario defines its own action schema

### Register your agent

Agents are registered in the agent registry in `src/tournament/runTournament.ts`. To add your agent:

1. Create your agent factory function (e.g., `src/agents/myAgent.ts`)
2. Import it in `src/tournament/runTournament.ts`
3. Add an entry to the `agentRegistry` object:

```typescript
const agentRegistry: Record<string, AgentRegistration> = {
  random: { factory: createRandomAgent },
  baseline: { factory: createBaselineAgent },
  noop: { factory: createNoopAgent },
  randomBidder: { factory: createRandomBidderAgent },
  conservative: { factory: createConservativeAgent },
  "ollama-heist": {
    factory: createOllamaHeistAgent,
    provenance: () => ({ metadata: buildOllamaHeistMetadata() }),
  },
  // Add yours here:
  myAgent: { factory: createMyAgent },
};
```

4. Run a match with your agent:

```bash
npm run match -- --scenario numberGuess --agentA myAgent --agentB baseline
```

### Available built-in agents

| Key | Scenario | Strategy |
|-----|----------|----------|
| `random` | NumberGuess | Random guess within range |
| `baseline` | NumberGuess | Binary search (narrows range each turn) |
| `noop` | Any | Always returns `{}` (smoke testing) |
| `randomBidder` | ResourceRivals | Random bid amount |
| `conservative` | ResourceRivals | Conservative bidding strategy |
| `ollama-heist` | Heist | LLM-powered via local Ollama |

### HTTP agents (remote)

For agents that run as separate processes (useful for any language/framework), see `examples/http-agent/`. Start an HTTP agent server:

```bash
node examples/http-agent/server.mjs --port 8781
node examples/http-agent/server.mjs --port 8782   # in another terminal
```

Then run a match via the HTTP gateway:

```bash
npm run match -- \
  --gateway http \
  --agent-urls "http://127.0.0.1:8781,http://127.0.0.1:8782" \
  --out match-output/match.jsonl
```

The gateway also writes `gateway_transcript.jsonl` alongside the match output.

## Verify Match Integrity

HashMatch produces SHA-256 hashes for all truth artifacts, enabling tamper detection.

### Verify a single match

```bash
npm run build:engine && node dist/cli/verify-match.js --path out/matches/<matchId>/
```

Checks that `match.jsonl` and `match_manifest.json` hashes match what's recorded in `match_summary.json`. Exit codes: 0 (pass), 1 (fail), 2 (error).

### Verify a tournament

```bash
npm run build:engine && node dist/cli/verify-tournament.js --path out/
```

Verifies the tournament manifest, all match directories, and the `truthBundleHash`.

### Validate a tournament bundle

```bash
npm run validate-bundle -- --path <tournament_folder>
```

Runs structural, cross-reference, content hash, standings, and broadcast manifest checks. Add `--require-signatures` for signed bundle verification and `--verbose` for detailed output.

## Project Structure

```
hashmatch/
├── src/
│   ├── agents/             # Built-in agent implementations
│   ├── scenarios/          # Scenario implementations (numberGuess, heist, resourceRivals)
│   ├── engine/             # Match execution engine (runMatch, gateway runner)
│   ├── tournament/         # Tournament orchestration and artifact generation
│   ├── cli/                # CLI entry points (run-match, run-tournament, scenario, verify-*, etc.)
│   ├── contract/           # TypeScript interfaces and event types
│   ├── core/               # Utilities (RNG, hashing, JSON serialization)
│   ├── gateway/            # HTTP/local agent communication adapters
│   ├── games/heist/        # Heist game framework (generator, validator, preview)
│   ├── lib/                # Replay library, redaction, commentary, moments
│   ├── app/                # Next.js web UI (replay viewer, leaderboard)
│   ├── components/         # React components
│   └── server/             # Backend match management
├── tests/                  # Vitest test files (60 test files)
├── Documents/              # Spec and design documents (30 files)
├── scenarios/              # Pre-generated heist scenario presets
├── examples/               # Example HTTP agent server
├── scripts/                # Build and ops utility scripts
└── .github/                # CI workflow and issue/PR templates
```

## Quality Checks

All four checks must pass before committing:

```bash
npm run lint            # ESLint
npm run format:check    # Prettier
npm run typecheck       # TypeScript strict mode
npm test                # Vitest test suite
```

## Next Steps

- **[Agent Adapter Spec](Documents/agent_adapter_spec.md)** — full contract for agent implementation (observation/action schemas, timing, packaging)
- **[Scenario Design Guidelines](Documents/scenario_design_guidelines.md)** — how to design scenarios that are fair and watchable
- **[Specification](Documents/specification.md)** — system architecture, event log contract, artifact layers
- **[Tournament Rules](Documents/tournament_rules.md)** — scoring, standings, mode profiles, verification
- **[Integrity & Verification](Documents/integrity_and_verification.md)** — how trust is built (hashing, receipts, reproducibility)
- **[Contributing](CONTRIBUTING.md)** — development setup and PR guidelines
