# Competitive Data Systems Landscape — Research Reference

> **Status:** Reference document — not a specification or action plan.
> **Date:** 2026-02-08
> **Authors:** GPT (breadth survey) + Claude (verified depth + independent research)
> **Purpose:** Inform external consumption contract design and Sprint #2 (`broadcast_manifest.json`).

---

## How to use this document

This document synthesizes two independent research passes on how real-world competitive systems expose structured match data to external consumers. It covers 15+ platforms across AI competitions, esports, board games, traditional sports, and poker.

Use it to:

- Ground architectural decisions in prior art rather than first principles
- Identify where HashMatch's design is unusual, conventional, or untested
- Find specific failure modes to design around
- Locate the closest structural analogues for deep study (especially ICPC)

Do **not** treat this as a convergence plan or action list. The research is descriptive, not prescriptive.

---

## Part 1: GPT Survey (Breadth)

_Full text of GPT's comparative analysis. Covers simulation AI competitions, board game archives, replay-centric esports, traditional sports data platforms, competitive programming, recurring patterns, failure modes, open questions, and assumption stress-tests._

_GPT's report is strong on breadth and pattern identification. It correctly identifies the major categories and recurring tradeoffs. Where it is weakest: some claims are directionally correct but lack specific verification (dates, formats, exact failure timelines). Claude's research (Part 2) provides that verification._

### Systems Covered (GPT)

| Category        | Systems                                          | Key Patterns                                          |
| --------------- | ------------------------------------------------ | ----------------------------------------------------- |
| AI Competitions | Halite, Battlecode, RoboCup, Google AI Challenge | JSON replay evolution, deterministic logs as truth    |
| Board Games     | Chess (PGN), Go (SGF), Lichess, OGS              | Portable text formats, longevity, open data           |
| Esports         | StarCraft II, Dota 2, Fighting Games             | Binary replays, version coupling, API instability     |
| Sports Data     | Opta, Sportradar, ESPN                           | XML/JSON feeds, correction disputes, narrative layers |
| Programming     | Codeforces, ICPC                                 | JSON APIs, contest packages, scoreboard freeze        |

### GPT's Key Patterns Identified

1. **Separation of layers** (truth vs derived vs narrative) — nearly universal
2. **Unified vs game-specific formats** — tension between standardization and expressiveness
3. **Deterministic replays vs complete state logs** — performance vs portability tradeoff
4. **API access vs artifact distribution** — mature systems offer both
5. **Real-time vs post-match data** — each system draws the line differently
6. **Data corrections and versioning** — a recurring unsolved problem

### GPT's Assumption Stress-Tests (Summary)

- **"Logs are truth and solve disputes"** → Logs are only as truthful as the system that generated them. Need auditing tools beyond hashing.
- **Determinism is guaranteed** → May break with physics, external APIs, or learning-in-the-loop. Hold for turn-based games, not universally.
- **Cryptographic receipts are necessary** → No current competition does this; trust scandals are rare. May be overengineering unless decentralized.
- **Layered output solves presentation** → Reality is messier; rigid separation may prove too limiting.
- **Automated highlights work** → Very early; real sports still rely on human editors.
- **"No servers required"** → Fine for now, but artifact-only won't hold at scale. Centralization tends to re-emerge.
- **Community will build on data** → True only if the audience exists first. "If you build it, they will come" is suspect.

_[Full GPT report text omitted for length — see `/docs/research/gpt_platform_integration_research.md` for the complete original.]_

---

## Part 2: Claude Verified Research (Depth)

_Independent research verifying, challenging, and extending GPT's findings with primary sources._

### Halite Replay Format — Verified with specifics

The Halite AI Competition (Two Sigma, 2016–2020) evolved its format three times:

| Version                  | Compression       | Inner format | File naming                                    |
| ------------------------ | ----------------- | ------------ | ---------------------------------------------- |
| Halite I (2016)          | gzip or plaintext | Custom text  | `{gameID}-{seed}.hlt`                          |
| Halite II (2017)         | gzip              | JSON         | `replay-{datetime}-{seed}-{W}-{H}-{epoch}.hlt` |
| Halite III (2018)        | zstd              | JSON         | `replay-{datetime}-{tz}-{seed}-{W}-{H}.hlt`    |
| Halite IV (2020, Kaggle) | None              | JSON         | Kaggle episode format                          |

**Key correction to GPT:** Halite I was NOT JSON — it was a custom plaintext format. GPT stated replays were "JSON-based" from early on; this is only true from Halite II onward.

**Durability failure:** When Two Sigma shut down servers, the `api.halite.io` API went dark, S3 replay storage became inaccessible, and the `hlt_client` tool stopped working. No coordinated archival preserved the full replay corpus. Only locally-generated replays survived.

**Lesson for HashMatch:** File-artifact systems are durable only if the files actually persist somewhere. Self-contained bundles are necessary but not sufficient — need a durability/hosting plan.

### ICPC Contest API — The most relevant structural analogue

The ICPC CCS API (stable: 2023-06, draft in development) is HashMatch's single most valuable reference. Key structural details:

**Package format:**

- Single directory (or ZIP), named after contest ID
- `contest.json` — contest metadata (times, freeze duration, penalty rules)
- `<endpoint>.json` — one file per API endpoint (teams, problems, submissions, judgements, etc.)
- `event-feed.ndjson` — complete event changelog in NDJSON format
- File references stored as `<endpoint>/<id>/<filename>` paths
- Supports YAML alternatives for human-editable files

**Event feed:**

- Streaming NDJSON (content type `application/x-ndjson`)
- Complete from beginning of time on initial connection, then live updates
- Keepalive newline every 120 seconds
- Reconnection via `?since_token=<token>`
- Event envelope: `{"type": "submissions", "id": "593", "data": {...}, "token": "abc123"}`
- No guaranteed ordering between event types

**Scoreboard freeze (access control during live play):**

- `contest.scoreboard_freeze_duration` — relative time before end
- `state` object records actual `frozen`/`thawed` timestamps
- Strict ordering: `started < frozen < ended < thawed < end_of_updates`
- `public` role MUST NOT receive judgements/runs after freeze
- `admin` role sees everything
- `contest_thaw` capability triggers the reveal (how the ICPC Resolver works)

**Use-case-driven package contents:**

- Configuration: api + contest + languages + problems + teams + accounts
- Results upload: api + teams + scoreboard + awards
- Full archive: all endpoints + event feed + submission files

### StarCraft II Replay Breakage — Verified with specific patches

- **Patch 2.0.10 (July 2013):** Hard break. Blizzard officially stated incompatibility. Client could auto-load older versions but required disconnecting from Battle.net.
- **Patch 3.0 (October 2015, Legacy of the Void):** Permanent hard break. All pre-3.0 replays became permanently unwatchable.
- **Minor patches:** Did NOT break replay compatibility if they didn't alter game simulation logic.

**However:** For data extraction (not in-game viewing), every version remains parseable via Blizzard's `s2protocol` (MIT license), which maintains per-build decoder modules covering 100+ build numbers. Community tools (sc2reader, spawningtool, s2prot) all handle version differences through this pattern.

**Lesson for HashMatch:** Version coupling is only catastrophic if you depend on the engine for replay. If your replay format is self-describing (JSONL events), you avoid the SC2 problem entirely. Version-stamp everything anyway.

### Dota 2 API — GPT's "2016 outage" claim doesn't hold

- No documented "prolonged outage in 2016." Evidence shows an April 2016 overnight outage and generally flaky service, but nothing dramatic.
- **The real API drama was January 2013:** Valve blocked Dotabuff's client API scraping and introduced "Expose Public Match Data" privacy toggle (default: off). Dotabuff temporarily shut down entirely.
- Dota 2 replays use `.dem` format (custom binary, Protocol Buffers, Snappy-compressed). Replays **expire from Valve servers after ~10 days**.
- OpenDota works around API limitations by downloading and parsing raw replay files using `clarity` (Java, by skadistats).

**Lesson for HashMatch:** API-dependent ecosystems are fragile when the platform operator changes policy. Artifact-first design protects against this — but only if artifacts are accessible and durable.

### Lichess — Proves open data scales

- **5.2 billion+ games** in database
- Monthly dumps: ~2+ TB compressed (zstd-compressed PGN), 20–30 GB per recent month
- API uses NDJSON over HTTP (not WebSocket, not SSE) with chunked transfer encoding
- Rate limits: 10 games/sec anonymous, 20 authenticated, 50 for own games
- Separate archives for variants, puzzles (5.68M), evaluated positions (342M)
- CC0 (public domain) license on all data
- 71 open-source repositories, substantial ecosystem of third-party tools

**Lesson for HashMatch:** Open data creates ecosystems, but Lichess is the exception — it's non-profit, volunteer-powered, and had a 10+ year head start. Don't assume "open data → vibrant community" without the audience first.

### Poker Hand Histories — The hidden-information precedent

**This is the closest analogue to HashMatch's redaction problem and GPT underweighted it.**

- No universal standard — each poker room uses proprietary plaintext format
- Hidden-information boundary operates at the **file-generation layer, not post-hoc redaction**
- Server generates hand history from the hero's perspective
- Opponents' cards appear ONLY if shown at showdown or voluntarily revealed
- Hands that don't reach showdown (~60–70%): opponents' cards are **permanently hidden**
- Three card visibility states: `showed`, `mucked` (revealed to participants after showdown), `folded` (never revealed)

**Key insight:** The format itself encodes the observer's perspective. There is no single canonical hand history — each participant receives a different version of the same hand.

**Two standardization efforts:**

- PHH format (University of Toronto, 2024): TOML syntax with `????` for unknown cards
- Open Hand History (OHH) v1.4.7: JSON with `hero_player_id` field

**Lesson for HashMatch:** Our architecture is different from poker's (one canonical stream, gated broadcast, not per-player files). But the poker pattern suggests we should consider: for post-match artifact distribution, should we emit per-perspective bundles alongside the full-truth bundle? This is a v2 question, not urgent.

### Opta F24 — How corrections create trust problems

- Format is UTF-8 XML, hierarchy: `<Games>` → `<Game>` → `<Event>` → `<Q>` (qualifiers)
- ~60 event type codes, 150+ qualifier types
- Corrections tracked via `last_modified` timestamp and Qualifier ID 144 ("Deleted event type")
- Qualifier ID 229 ("Post-match complete") signals QC review finished
- **Betting impact:** Sky Bet settles on Opta data; corrections after settlement can withdraw funds from bettors with no recourse

**Lesson for HashMatch:** Even with automated, deterministic logging (which avoids Opta's human-entry problem), we should plan for post-match corrections (bug discovered, match voided). The external consumption contract should define what "finalized" means and whether/how corrections propagate.

### ESPN API Shutdown — Verified timeline

- Launched March 5, 2012 at SXSW
- Announced discontinuation August 2014
- All keys deactivated December 8, 2014
- Internal/partner API tiers survived
- Website-powering APIs remain publicly accessible (community-documented, unsupported)

### Additional Systems Not in GPT's Report

**Riot Games API:** Formal developer portal with tiered access, per-method rate limits via HTTP headers, match timeline endpoint with minute-by-minute snapshots. More structured than Valve's approach.

**F1 Timing Data:** Streams via SignalR from `livetiming.formula1.com`, undocumented JSON, car telemetry at ~4.2Hz. Community tools FastF1 and OpenF1 consume this. Another case where the official platform doesn't provide clean data and the community builds the tooling.

**CodinGame:** JSON replays containing stdin/stdout, undocumented REST API, format changes per challenge. No cross-game standard.

**Battlecode:** Google FlatBuffers (binary), year-specific extensions, no cross-year compatibility by design. Infrastructure runs on Galaxy framework (Siarnaq/Saturn/Titan).

**Blockchain verification in esports:** Only notable attempt is FYX Gaming (BSV blockchain, CryptoFights). Gained ESIC membership but negligible mainstream adoption. GPT's claim that "no mainstream competition uses blockchain verification" is **confirmed true.**

---

## Part 3: Convergent Findings (Where Both Analyses Agree)

### 1. Every mature system converges on API + Artifact dual-mode

No competitive system at scale survived on files alone. The pattern is always: live API for real-time consumers, downloadable artifacts for archival/analysis. ICPC formalized this explicitly. Halite tried file-only and the data died when servers went down.

**HashMatch implication:** Our current artifact-first approach is correct for the stage we're at. But plan the API surface now (even if building it later) so the artifact format doesn't accidentally preclude it.

### 2. Centralized trust is the universal practical model

No mainstream competition uses cryptographic verification. Trust comes from the platform operator running the matches. Downloadable replays provide implicit verifiability (you can independently parse them), but nobody actually does routine verification.

**HashMatch implication:** Our hash-based receipts are worth having (defense in depth, cheap to implement, useful for dispute resolution). But don't over-invest in them or treat them as a differentiator. They're table stakes for credibility, not a product feature.

### 3. Hidden information is handled at the generation layer

Poker, Dota 2 fog-of-war, ICPC scoreboard freeze — all enforce visibility at the point of data generation or serving, not through post-hoc editing of a shared artifact.

**HashMatch implication:** Our `_private` field convention + server-side stripping at the broadcast gate is architecturally sound. It's closer to ICPC's role-based access control than to poker's per-player files. The redaction audit (Sprint #1) confirmed the pipeline works. Per-perspective artifact exports are a v2 enhancement, not a gap.

### 4. Version coupling kills replay archives

StarCraft II is the canonical cautionary tale. Any replay format that depends on a specific engine version for interpretation creates a time bomb.

**HashMatch implication:** Our JSONL event logs are self-describing (each event carries enough context to interpret without the engine). This is a genuine advantage over SC2-style minimal-input replays. Maintain this property — don't optimize for file size by stripping context.

### 5. Open data creates ecosystems, but only with critical mass

Lichess proves it works. But Lichess is non-profit, has 5+ billion games, and a 10+ year head start. Most AI competitions (Halite, Google AI Challenge) had modest community tooling despite open data.

**HashMatch implication:** Provide the data, but build the first-party tools yourself until the community materializes. Don't assume "if we expose it, they will come."

### 6. Automated storytelling is unproven

No major sports broadcast relies on fully automated commentary or highlight detection. Even the best systems (Opta-derived xG, NBA clutch stats) are inputs to human storytelling, not replacements.

**HashMatch implication:** `moments.json` and `commentary.json` are correctly labeled as optional/derived. Keep them as heuristics, iterate with real spectator feedback, don't treat them as solved.

---

## Part 4: Key Structural References

### ICPC Contest API (highest priority for Sprint #2)

- **Spec:** https://ccs-specs.icpc.io/2023-06/ (stable), https://ccs-specs.icpc.io/draft/ (latest)
- **Source:** https://github.com/icpc/ccs-specs
- **Why it matters:** Package format, event feed design, access control during live play, use-case-driven content requirements — all directly applicable to `broadcast_manifest.json` design.
- **Specific parallels:** Contest Package ↔ Match Bundle, event-feed.ndjson ↔ match.jsonl, scoreboard freeze ↔ `_private` redaction during live play, Resolver thaw ↔ post-match reveal

### Lichess API + Database

- **Spec:** OpenAPI 3.1.0, https://lichess.org/api
- **Database:** https://database.lichess.org/
- **Why it matters:** Most successful open competitive data system. NDJSON streaming pattern, rate limiting model, dual API + dump approach.

### Poker Hand History Formats

- **PHH:** https://arxiv.org/abs/2312.11753 (TOML-based, University of Toronto)
- **OHH:** https://hh-specs.handhistory.org (JSON-based, PokerTracker-backed)
- **Why it matters:** Only domain with formalized hidden-information notation in the artifact format itself.

### StarCraft II s2protocol

- **Source:** https://github.com/Blizzard/s2protocol
- **Why it matters:** Canonical example of per-version decoding strategy for evolving replay formats.

### Opta F24 Schema

- **Overview:** https://www.soccermetrics.net/match-data-collection/the-opta-data-schema-an-introduction
- **Why it matters:** Most detailed real-world example of event-level sports data with correction/versioning mechanisms.

### IPTC Sport Schema

- **Spec:** https://sportschema.org/ (v1.1, RDF/OWL, JSON-LD)
- **Why it matters:** Industry standard for multi-sport data interchange. Shows what "standardization" looks like at maturity.

---

## Part 5: Open Questions for HashMatch

These are questions the research surfaced but did not answer. They require design decisions, not more research.

1. **What does "finalized" mean for a match bundle?** ICPC has explicit `state.finalized` timestamps. We need an equivalent — when does a bundle become the canonical record? What happens if a bug is discovered afterward?

2. **Should we emit per-perspective artifact bundles?** Poker does this (each player gets their own hand history). We currently have one canonical stream with role-based viewing. Per-perspective exports would serve post-match analysis by individual agents/teams.

3. **What is the minimum viable self-contained bundle?** If all HashMatch servers disappear tomorrow, which files must be present for a third party to understand and verify what happened in a match?

4. **When (not if) do we add an API?** Every system that scaled eventually needed one. The question is whether to design the API surface now (as a contract) even if implementation is deferred.

5. **How do we handle match corrections?** Voided matches, discovered bugs, re-scored tournaments. Opta's experience shows this is a trust-critical problem. Define the process before it's needed.

6. **Do we need a reconnection token model for live streams?** ICPC's event feed supports `?since_token=`. Our SSE stream may need similar reconnection semantics for reliable live consumption.
