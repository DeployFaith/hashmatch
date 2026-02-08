# Repository Guidelines

## Project Structure & Module Organization

- `Documents/` contains project documentation (21 spec/design documents).
- `src/` holds TypeScript source code with modules for engine, CLI, web UI, scenarios, agents, gateway, and game frameworks.
- `tests/` contains Vitest test files (39 files). Use `*.test.ts` naming.
- `scenarios/` contains pre-generated heist scenario presets.
- `examples/` contains an HTTP agent server example.
- `scripts/` is reserved for repo automation.
- `.github/` includes CI workflow and issue/PR templates.

## Build, Test, and Development Commands

- `npm install`: installs dev dependencies.
- `npm run lint`: runs ESLint across `src/**/*.ts` and `tests/**/*.ts`.
- `npm run format`: formats the repo with Prettier.
- `npm run format:check`: validates formatting without writing.
- `npm run typecheck`: runs `tsc --noEmit` with strict settings.
- `npm test`: runs the Vitest suite in CI mode.

## Coding Style & Naming Conventions

- Indentation is 2 spaces, LF line endings, and final newlines (see `.editorconfig`).
- TypeScript is strict (`tsconfig.json`), ES2022 target, NodeNext modules.
- Use `camelCase` for variables/functions and `PascalCase` for types/classes.
- Prefer explicit exports in `src/index.ts` when adding public APIs.
- Formatting is handled by Prettier; linting by ESLint (flat config).

## Testing Guidelines

- Test framework: Vitest.
- Place tests in `tests/` and name files `*.test.ts`.
- Keep tests fast and deterministic. Add new tests for all new behaviors.
- Run a single file: `npx vitest run tests/smoke.test.ts`.

## Commit & Pull Request Guidelines

- Commit messages currently follow a Conventional Commits style (example: `chore: initial repository scaffold`). Use `feat:`, `fix:`, `chore:`, etc.
- PRs should include a short summary and testing notes (see `.github/PULL_REQUEST_TEMPLATE.md`).
- Link relevant issues where applicable and ensure `lint`, `typecheck`, and `test` pass.

## Security & Configuration Tips

- Report vulnerabilities privately to `security@deployfaith.xyz` (see `SECURITY.md`).
- Use the Node LTS line defined in `.nvmrc`.
