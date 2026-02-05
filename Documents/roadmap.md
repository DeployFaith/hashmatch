# Project Roadmap

## v0 — Contract + Deterministic Match Runner (current)

- [x] Define Contract v0 interfaces (`Agent`, `Scenario`, `MatchRunnerConfig`)
- [x] Typed event model with discriminated union
- [x] Seeded PRNG (mulberry32) with child-seed derivation
- [x] Synchronous match runner producing a complete event log
- [x] Number Guess demo scenario
- [x] Reference agents: random, baseline (binary search)
- [x] CLI tool for running demos (`npm run demo -- --seed 123`)
- [x] Determinism and serialization test suite

## v0.1 — Tournaments + More Scenarios

- [ ] Tournament runner: round-robin or bracket over multiple matches
- [ ] Aggregate scoring and leaderboard computation
- [ ] Additional scenarios (e.g., Coin Duel, simple grid world)
- [ ] Agent registration / discovery (file-based)
- [ ] CLI enhancements: select scenario, list agents, run tournament

## v0.2 — Spectator Playback

- [ ] JSONL log reader / parser
- [ ] Terminal-based replay viewer (step through events)
- [ ] Web-based replay viewer (static HTML + JS, reads JSONL)
- [ ] Event filtering and search

## v0.3 — Async Agents + Sandboxing

- [ ] Async `act()` interface for I/O-bound agents (e.g., LLM calls)
- [ ] Per-agent time budgets and timeout enforcement
- [ ] Process-level sandboxing for untrusted agents
- [ ] Agent protocol over stdin/stdout (subprocess agents)

## Future

- Networked agents (HTTP/WebSocket protocol)
- Persistent match history (SQLite or similar)
- ELO / TrueSkill rating system
- Community scenario registry
- CI integration for agent testing

## Non-goals

These are explicitly out of scope for the foreseeable future:

- Cloud infrastructure, containers, or managed services
- Real-time multiplayer networking
- GUI game client
- Monetization or user accounts
