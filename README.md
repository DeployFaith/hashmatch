# HashMatch

Competitive agent tournament platform — "UFC for Agents." Deterministic match engine, round-robin tournament harness, CLI tooling, and web-based replay viewer.

## Structure

- `Documents/` project documentation (21 spec/design documents)
- `src/` source code (engine, CLI, web UI, scenarios, agents, gateway)
- `tests/` test suite (39 test files)
- `scenarios/` pre-generated heist scenario presets
- `examples/` example HTTP agent server
- `scripts/` build/utility scripts
- `.github/` GitHub workflows and templates

## Commands

```bash
npm install
npm run lint
npm run format
npm run format:check
npm run typecheck
npm test
npm run build
```

## Run & Replay

Run a match and save the event log:

```bash
npm run demo -- --out out.jsonl
```

Or use the configurable match runner:

```bash
npm run match -- \
  --scenario numberGuess \
  --seed 123 \
  --turns 20 \
  --agentA random \
  --agentB baseline \
  --out out.jsonl
```

Replay a match log as a readable recap:

```bash
npm run replay -- --in out.jsonl
```

Write a Markdown recap file:

```bash
npm run replay -- --in out.jsonl --out-md recap.md
```

## Tournament

Run a round-robin tournament:

```bash
npm run tournament -- --seed 42 --rounds 3 --maxTurns 20 --scenario numberGuess --agents random,baseline
```

Write a single-file tournament bundle:

```bash
npm run tournament -- --seed 42 --rounds 3 --maxTurns 20 --scenario numberGuess --agents random,baseline --bundle-out bundle.json
```

## Verification

Verify match integrity (recompute hashes):

```bash
npm run build:engine && node dist/cli/verify-match.js --path matches/round0-random-baseline/
```

Verify tournament integrity:

```bash
npm run build:engine && node dist/cli/verify-tournament.js --path tournament_run/
```

## Gateway

- `--gateway` supports `local` or `http`.
- `--agent-urls` is required for `http`, and the count must match the number of agents (2 by default).
- When `--out` is set, `gateway_transcript.jsonl` is written alongside the match output file.

## Manual Ops (VPS)

These scripts are intended for running on the VPS. They build once (`npm run build`) and then execute
`node dist/cli/...` directly.

Run a local-only match (terminal recap + temp JSONL, no publish):

```bash
scripts/match-local.sh
```

Run a local-only match with overrides:

```bash
scripts/match-local.sh --scenario numberGuess --seed 123 --turns 30 --agentA baseline --agentB random
```

Publish latest match artifacts (latest.jsonl + latest.md) to the website:

```bash
scripts/match-publish.sh
```

Publish latest match with overrides:

```bash
scripts/match-publish.sh --scenario numberGuess --seed 123 --turns 25 --agentA random --agentB baseline
```

Publish a tournament summary only:

```bash
scripts/tournament-publish.sh
```

Publish a tournament with per-match logs:

```bash
scripts/tournament-publish.sh --seed 123 --rounds 5 --maxTurns 30 --scenario numberGuess --agents random,baseline --writeLogs
```

Published URL patterns:

- https://hashmatch.deployfaith.xyz/matches/latest.jsonl
- https://hashmatch.deployfaith.xyz/matches/latest.md
- https://hashmatch.deployfaith.xyz/tournaments/<run_id>/tournament.json
- https://hashmatch.deployfaith.xyz/tournaments/<run_id>/matches/\*.jsonl (when --writeLogs is used)

Project documentation lives in Documents/.

## Verify the signed exhibition bundle

 npm ci
 npm run validate-bundle -- --path data/exhibitions/heist-showcase-001 --require-signatures
 npm run verify-receipt -- data/exhibitions/heist-showcase-001 --pub keys/exhibitions.pub.pem
