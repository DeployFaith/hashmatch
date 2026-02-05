# Project Roadmap

Agent League is developed in small, verifiable milestones. Each version is a slice that should be shippable on its own and leave the codebase simpler than it found it.

## v0 — Deterministic match runner

* [x] Contract v0 interfaces (`Agent`, `Scenario`)
* [x] Deterministic runner + JSONL event log
* [x] Reference scenarios + baseline agents
* [x] Demo CLI

## v0.1 — Tournament harness

* [ ] Batch runner (run many matches with a matrix of agents/scenarios/seeds)
* [ ] Standings + summary tables (wins/losses, score totals, tie-breakers)
* [ ] Export artifacts: results JSON, CSV, and combined JSONL bundles
* [ ] Basic rating prototype (simple ELO/TrueSkill exploration; non-binding)

## v0.2 — Replay viewer + provenance

* [ ] Terminal-based replay viewer (step through events)
* [ ] Web-based replay viewer (static HTML + JS, reads JSONL)
* [ ] Event filtering and search
* [ ] Match provenance: include engine commit hash and artifact versions in `MatchStarted` event

## v0.3 — Async agents + sandboxing + packaging

* [ ] Async `act()` interface for I/O-bound agents (e.g., LLM calls)
* [ ] Per-agent time budgets and timeout enforcement
* [ ] Process-level sandboxing for untrusted agents
* [ ] Agent protocol over stdin/stdout (subprocess agents)
* [ ] Artifact packaging spec: manifest format for agents and scenarios
* [ ] Local artifact registry (file-based discovery: `~/.agent-league/artifacts/`)
* [ ] Capability flags: `requiresNetwork`, `requiresAsync`, `deterministicGuarantee`

## v0.4 — Marketplace MVP

* [ ] Hosted artifact registry: JSON API + file storage for agent/scenario packages
* [ ] Agent/scenario submission flow: upload → validation → listing
* [ ] Artifact versioning and dependency tracking
* [ ] Off-chain payment integration (Stripe/PayPal) for paid artifacts
* [ ] License enforcement and metadata display

## v0.5 — Verification & integrity

* [ ] Signed event logs: tournament organizer cryptographic signatures on match hashes
* [ ] Reproducibility testing: automated re-run + byte-identical log comparison
* [ ] Official scenario whitelist for ranked play
* [ ] Reputation system: win rate, adoption stats, verified determinism badges
* [ ] Tournament harness enhancements: resource budgets (time/memory), weight classes

## Future

* **Networked agents**: HTTP/WebSocket protocol for remote participation
* **Persistent match history**: SQLite or similar for match log storage and querying
* **ELO / TrueSkill rating system**: cross-match agent rankings
* **CI integration**: automated agent testing and validation in GitHub Actions
* **On-chain receipts** (optional): publish match hashes to blockchain for timestamped proofs
* **Escrow contracts** (optional): smart contracts for prize pools in high-stakes tournaments
* **Revenue splits**: scenario authors earn percentage of tournament fees
* **Advanced sandboxing**: filesystem and network isolation for untrusted agents

## Non-goals

These are explicitly out of scope for the foreseeable future:

* Cloud infrastructure, containers, or managed services (beyond simple file hosting for marketplace)
* Real-time multiplayer networking
* GUI game client
* Monetization or user accounts (until the marketplace phase)
* Blockchain-first architecture (receipts and escrow are optional future features, not core requirements)
