import { createRng } from "../core/rng.js";

export const MATCH_ID_PATTERN = /^m_[a-z0-9]{12}$/;

/** Generate a deterministic match id from the RNG stream. */
export function generateMatchId(rng: () => number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "m_";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(rng() * chars.length)];
  }
  return id;
}

export function createMatchIdFromSeed(seed: number): string {
  const rng = createRng(seed);
  return generateMatchId(rng);
}

export function isSafeMatchId(matchId: string): boolean {
  return MATCH_ID_PATTERN.test(matchId);
}
