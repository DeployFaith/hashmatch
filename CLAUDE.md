# CLAUDE.md — HashMatch

## Project Overview

HashMatch is a TypeScript/Node.js + Next.js project implementing a competitive agent tournament platform ("UFC for Agents"). It includes a deterministic match engine, round-robin tournament harness, CLI tooling, and a web-based replay viewer. Source code uses ES modules with strict TypeScript.

## Quick Reference

```bash
npm install          # Install dependencies (use npm ci for reproducible installs)
npm run lint         # Lint src/ and tests/ with ESLint
npm run format:check # Check Prettier formatting
npm run format       # Auto-format all files with Prettier
npm run typecheck    # Type-check with tsc --noEmit
npm test             # Run tests with Vitest
npm run dev          # Start Next.js dev server (web UI)
npm run build        # Build Next.js app
npm run demo         # Run a demo match and write JSONL output
npm run match        # Run a single configurable match
npm run tournament   # Run a round-robin tournament
npm run replay       # Replay a match from a JSONL file
```

All four checks (lint, format:check, typecheck, test) must pass before any commit or PR.

## Repository Structure

```
src/
  app/            Next.js pages (replay viewer, leaderboard, agents, matches, director, settings)
  cli/            CLI entry points (run-demo, run-match, run-tournament, replay-match, verify-match, verify-tournament, scenario)
  components/     React components (app shell, event feed, timeline, UI primitives)
  contract/       Type definitions and interfaces (Agent, Scenario, events)
  core/           Core utilities (seeded RNG, stable JSON serialization, hashing, broadcast manifest)
  engine/         Match execution engine (runMatch, gateway runner, heist competitive)
  games/heist/    Heist game framework (types, generator, validator, preview)
  gateway/        Remote agent communication (HTTP adapter, local adapter, transcript)
  lib/            Replay library (parser, redaction, commentary, moments), models, mock data, store
  agents/         Built-in agents (random, baseline, noop, randomBidder, conservative, ollama)
  scenarios/      Scenario implementations (numberGuess, heist, resourceRivals)
  server/         Backend match management (runner, artifacts, storage)
  tournament/     Tournament orchestration (runTournament, artifacts, provenance, types)
tests/            Test files using Vitest (*.test.ts) — 56 test files
Documents/        Project documentation (30 spec/design documents)
scripts/          Build/utility scripts (gen-sample-replay, validate-jsonl, shell scripts)
scenarios/        Pre-generated heist scenario files (9 presets)
examples/         Example HTTP agent server
public/           Static assets (sample replay files)
.github/          CI workflow and issue/PR templates
```

## Code Conventions

- **Language:** TypeScript with strict mode enabled
- **Module system:** ES modules (`"type": "module"` in package.json)
- **Target:** ES2022, NodeNext module resolution
- **Indentation:** 2 spaces, no tabs
- **Line width:** 100 characters max (Prettier)
- **Line endings:** LF (Unix-style)
- **Semicolons:** Required
- **Equality:** Strict only (`===` / `!==`), enforced by ESLint `eqeqeq`
- **Curly braces:** Required for all blocks (`curly: "all"`)
- **Variables:** Prefer `const`; `let` only when reassignment is needed; never `var`
- **Unused variables:** Error, except parameters prefixed with `_`
- **Console:** Allowed but triggers a warning (`no-console: warn`)

## TypeScript Configuration

- **`tsconfig.json`** (main): strict mode, `target: ES2022`, JSX react-jsx, path alias `@/*` → `./src/*`. Includes `src/` and `tests/`.
- **`tsconfig.build.json`** (engine/CLI): `module: NodeNext`, outputs to `dist/`. Includes engine, CLI, contract, core, scenarios, tournament code. Excludes web app code.
- **`tsconfig.scripts.json`** (build scripts): outputs to `dist-scripts/`.

## Testing

- **Framework:** Vitest 2.x
- **Style:** BDD (`describe` / `it` / `expect`)
- **File naming:** `*.test.ts` in the `tests/` directory
- **Run:** `npm test` (runs `vitest run`)

## Linting & Formatting

- **ESLint 9** with flat config (`eslint.config.js`) — scoped to `src/**/*.{ts,tsx}` and `tests/**/*.{ts,tsx}`
- **Prettier 3** — config in `.prettierrc.json`, ignore rules in `.prettierignore`
- **EditorConfig** — `.editorconfig` ensures consistent editor settings

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests:

1. Checkout → Setup Node LTS → `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build:engine`
5. `npm test`

All steps must pass for the pipeline to succeed. Run `npm run format:check` locally before committing (not yet in CI).

## Branching & PRs

- Feature branches off `main`
- Keep PRs focused and scoped
- Include summary and testing notes in PR descriptions
- All CI checks must pass before merge

## Dependencies

- **Runtime:** React 19, Next.js 16, Radix UI, Tailwind CSS 4, Zustand, Zod 4, Lucide icons
- **Dev:** TypeScript 5.x, ESLint 9.x, Prettier 3.x, Vitest 2.x, @types/node 22.x
- **Node version:** LTS (specified in `.nvmrc`)
- **Override:** esbuild pinned to `^0.25.0` (security advisory)

## Key Files

| File                                | Purpose                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `src/index.ts`                      | Main entry point (re-exports)                                  |
| `src/engine/runMatch.ts`            | Core match execution engine                                    |
| `src/engine/runMatchWithGateway.ts` | HTTP gateway-based match runner                                |
| `src/tournament/runTournament.ts`   | Round-robin tournament orchestration                           |
| `src/tournament/artifacts.ts`       | Tournament artifact generation (manifests, standings, bundles) |
| `src/contract/types.ts`             | Event types and domain types                                   |
| `src/contract/interfaces.ts`        | Agent, Scenario, and runner config interfaces                  |
| `src/scenarios/numberGuess/`        | NumberGuess scenario                                           |
| `src/scenarios/heist/`              | Heist stealth/objective scenario                               |
| `src/scenarios/resourceRivals/`     | ResourceRivals hidden-information bidding scenario             |
| `src/games/heist/`                  | Heist game framework (types, generator, validator, preview)    |
| `src/gateway/`                      | Remote agent communication (HTTP + local adapters)             |
| `src/cli/verify-match.ts`           | Match integrity verification CLI                               |
| `src/cli/verify-tournament.ts`      | Tournament integrity verification CLI                          |
| `src/cli/scenario.ts`               | Scenario CLI (list, generate, validate, preview)               |
| `src/core/hash.ts`                  | SHA-256 hashing for artifact integrity                         |
| `src/app/replay/page.tsx`           | Web replay viewer                                              |
| `src/lib/replay/`                   | Replay library (parser, redaction, commentary, moments)        |
| `src/lib/redaction/`                | Event redaction (`_private` field stripping)                   |
| `eslint.config.js`                  | ESLint flat config with project rules                          |
| `tsconfig.json`                     | TypeScript compiler options (Next.js + tests)                  |
| `tsconfig.build.json`               | TypeScript build config for engine/CLI                         |
| `.prettierrc.json`                  | Prettier formatting rules                                      |
| `.github/workflows/ci.yml`          | CI pipeline definition                                         |
| `CONTRIBUTING.md`                   | Contribution guidelines                                        |
| `SECURITY.md`                       | Security vulnerability reporting (security@deployfaith.xyz)    |

## Secrets Policy

Scenarios with hidden state must not leak secrets through mid-game `StateUpdated` events. Use `summarize()` for public state only; implement the optional `reveal()` method to disclose secrets at match end via `MatchEnded.details`. See `Documents/specification.md` §9 for details.
