# CLAUDE.md — Agent League

## Project Overview

Agent League is a TypeScript/Node.js project in early scaffold phase. The repository provides foundational tooling, CI/CD, and documentation structure. Source code uses ES modules with strict TypeScript.

## Quick Reference

```bash
npm install          # Install dependencies (use npm ci for reproducible installs)
npm run lint         # Lint src/ and tests/ with ESLint
npm run format:check # Check Prettier formatting
npm run format       # Auto-format all files with Prettier
npm run typecheck    # Type-check with tsc --noEmit
npm test             # Run tests with Vitest
```

All four checks (lint, format:check, typecheck, test) must pass before any commit or PR. CI runs them on every push and pull request.

## Repository Structure

```
src/              TypeScript source code (ES modules)
tests/            Test files using Vitest (*.test.ts)
Documents/        Project documentation (overview, specification, roadmap)
scripts/          Build/utility scripts (currently empty)
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

- `strict: true` — all strict checks active
- `noEmit: true` — type checking only, no JS output
- `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`
- Includes: `src/` and `tests/`

## Testing

- **Framework:** Vitest 2.x
- **Style:** BDD (`describe` / `it` / `expect`)
- **File naming:** `*.test.ts` in the `tests/` directory
- **Run:** `npm test` (runs `vitest run`)

## Linting & Formatting

- **ESLint 9** with flat config (`eslint.config.js`) — scoped to `src/**/*.ts` and `tests/**/*.ts`
- **Prettier 3** — config in `.prettierrc.json`, ignore rules in `.prettierignore`
- **EditorConfig** — `.editorconfig` ensures consistent editor settings

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. Checkout → Setup Node LTS → `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`

All steps must pass for the pipeline to succeed.

## Branching & PRs

- Feature branches off `main`
- Keep PRs focused and scoped
- Include summary and testing notes in PR descriptions
- All CI checks must pass before merge

## Dependencies

- **Runtime:** None currently
- **Dev:** TypeScript 5.x, ESLint 9.x, Prettier 3.x, Vitest 2.x, @types/node 22.x
- **Node version:** LTS (specified in `.nvmrc`)
- **Override:** esbuild pinned to `^0.25.0` (security advisory)

## Key Files

| File                       | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `src/index.ts`             | Main entry point                                            |
| `tests/smoke.test.ts`      | Smoke test verifying test setup                             |
| `eslint.config.js`         | ESLint flat config with project rules                       |
| `tsconfig.json`            | TypeScript compiler options                                 |
| `.prettierrc.json`         | Prettier formatting rules                                   |
| `.github/workflows/ci.yml` | CI pipeline definition                                      |
| `CONTRIBUTING.md`          | Contribution guidelines                                     |
| `SECURITY.md`              | Security vulnerability reporting (security@deployfaith.xyz) |
