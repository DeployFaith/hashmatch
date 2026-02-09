# Design Principles

## Locked Principles (Effective Now)

Decided 2026-02-06. See `hashmatch_live_platform_direction_decision_architecture.md` for full rationale.

1. **Live-first, not offline-first.** The primary experience is watching matches via URLs and live streams. "Offline-first" is no longer the framing language for the product.
2. **Artifacts are trust substrate, not product surface.** Manifests, hashes, receipts, and bundles exist for verification, dispute resolution, and archival — not as the main thing users interact with.
3. **Spectator UX may maintain ephemeral state not present in truth.** The viewer can hold transient display state (animations, transitions, layout) that is not part of the authoritative event log.
4. **CLI ergonomics do not define user ergonomics.** The CLI is a builder/operator tool. Spectator-facing UX is designed independently.
5. **Three centers of gravity: Execution / Trust / Experience.** Shared vocabulary across the team. Execution = the match engine. Trust = integrity layer (hashes, receipts, verification). Experience = spectator and builder UX.
6. **Trailer, not premiere.** The first public thing is a teaser, not the full product launch. Ship something compelling and small.
7. **Sanctioned integrity, no disclaimers, from day one.** Verification is built-in and presented with confidence. No "beta" hedging on trust claims.
