# Agent League

Repository scaffold for the Agent League project.

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
```

## Run & Replay

Run a match and save the event log:

```bash
npm run demo -- --out out.jsonl
```

Or use the configurable match runner:

```bash
npm run match -- --scenario numberGuess --seed 123 --turns 20 --agentA random --agentB baseline --out out.jsonl
```

Replay a match log as a readable recap:

```bash
npm run replay -- --in out.jsonl
```

Write a Markdown recap file:

```bash
npm run replay -- --in out.jsonl --out-md recap.md
```

Project documentation lives in `Documents/`.
