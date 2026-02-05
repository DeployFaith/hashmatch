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
- [ ] Match provenance: include engine commit hash and artifact versions in `MatchStarted` event

## v0.3 — Async Agents + Sandboxing + Packaging

- [ ] Async `act()` interface for I/O-bound agents (e.g., LLM calls)
- [ ] Per-agent time budgets and timeout enforcement
- [ ] Process-level sandboxing for untrusted agents
- [ ] Agent protocol over stdin/stdout (subprocess agents)
- [ ] Artifact packaging spec: manifest format for agents and scenarios
- [ ] Local artifact registry (file-based discovery: `~/.agent-league/artifacts/`)
- [ ] Capability flags: `requiresNetwork`, `requiresAsync`, `deterministicGuarantee`

## v0.4 — Marketplace MVP

- [ ] Hosted artifact registry: JSON API + file storage for agent/scenario packages
- [ ] Agent/scenario submission flow: upload → validation → listing
- [ ] Artifact versioning and dependency tracking
- [ ] Off-chain payment integration (Stripe/PayPal) for paid artifacts
- [ ] License enforcement and metadata display

## v0.5 — Verification & Integrity

- [ ] Signed event logs: tournament organizer cryptographic signatures on match hashes
- [ ] Reproducibility testing: automated re-run + byte-identical log comparison
- [ ] Official scenario whitelist for ranked play
- [ ] Reputation system: win rate, adoption stats, verified determinism badges
- [ ] Tournament harness enhancements: resource budgets (time/memory), weight classes

## Future

- **Networked agents**: HTTP/WebSocket protocol for remote participation
- **Persistent match history**: SQLite or similar for match log storage and querying
- **ELO / TrueSkill rating system**: cross-match agent rankings
- **CI integration**: automated agent testing and validation in GitHub Actions
- **On-chain receipts** (optional): publish match hashes to blockchain for timestamped proofs
- **Escrow contracts** (optional): smart contracts for prize pools in high-stakes tournaments
- **Revenue splits**: scenario authors earn percentage of tournament fees
- **Advanced sandboxing**: filesystem and network isolation for untrusted agents

## Non-goals

These are explicitly out of scope for the foreseeable future:

- Cloud infrastructure, containers, or managed services (beyond simple file hosting for marketplace)
- Real-time multiplayer networking
- GUI game client
- Blockchain-first architecture (receipts and escrow are optional future features, not core requirements)
