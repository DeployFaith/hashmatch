import type { Seed } from "../contract/types.js";

/**
 * Mulberry32 — a fast, seedable 32-bit PRNG.
 * Returns a function that produces numbers in [0, 1).
 *
 * DO NOT use Math.random on any simulation-critical path.
 * Always use a seeded RNG obtained from this module.
 */
export function createRng(seed: Seed): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded random integer in [min, max] (inclusive). */
export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Derive a child seed from a parent RNG stream. */
export function deriveSeed(rng: () => number): Seed {
  return (rng() * 4294967296) | 0;
}
