# HashMatch

Repository scaffold for the HashMatch project.

## Structure

- `Documents/` project overview, specification, and roadmap
- `src/` source code
- `tests/` test suite
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
Run & Replay
Run a match and save the event log:

npm run demo -- --out out.jsonl
Or use the configurable match runner:

npm run match -- \
  --scenario numberGuess \
  --seed 123 \
  --turns 20 \
  --agentA random \
  --agentB baseline \
  --out out.jsonl
Replay a match log as a readable recap:

npm run replay -- --in out.jsonl
Write a Markdown recap file:

npm run replay -- --in out.jsonl --out-md recap.md
Manual Ops (VPS)
These scripts are intended for running on the VPS. They build once (npm run build) and then execute node dist/cli/... directly.

Run a local-only match (terminal recap + temp JSONL, no publish):

scripts/match-local.sh
Run a local-only match with overrides:

scripts/match-local.sh --scenario numberGuess --seed 123 --turns 30 --agentA baseline --agentB random
Publish latest match artifacts (latest.jsonl + latest.md) to the website:

scripts/match-publish.sh
Publish latest match with overrides:

scripts/match-publish.sh --scenario numberGuess --seed 123 --turns 25 --agentA random --agentB baseline
Publish a tournament summary only:

scripts/tournament-publish.sh
Publish a tournament with per-match logs:

scripts/tournament-publish.sh --seed 123 --rounds 5 --maxTurns 30 --scenario numberGuess --agents random,baseline --writeLogs
Published URL patterns:

https://hashmatch.deployfaith.xyz/matches/latest.jsonl

https://hashmatch.deployfaith.xyz/matches/latest.md

https://hashmatch.deployfaith.xyz/tournaments/<run_id>/tournament.json

https://hashmatch.deployfaith.xyz/tournaments/<run_id>/matches/*.jsonl (when --writeLogs is used)

Project documentation lives in Documents/.
