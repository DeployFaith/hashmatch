import { describe, expect, it } from "vitest";
import { createRng, deriveSeed, randomInt } from "../src/core/rng.js";

describe("Deterministic RNG", () => {
  it("same seed produces same sequence", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = createRng(1);
    const b = createRng(2);
    const va = Array.from({ length: 10 }, () => a());
    const vb = Array.from({ length: 10 }, () => b());
    expect(va).not.toEqual(vb);
  });

  it("output is in [0, 1)", () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randomInt returns values within bounds (inclusive)", () => {
    const rng = createRng(99);
    for (let i = 0; i < 500; i++) {
      const v = randomInt(rng, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("deriveSeed returns a finite number", () => {
    const rng = createRng(7);
    const child = deriveSeed(rng);
    expect(typeof child).toBe("number");
    expect(Number.isFinite(child)).toBe(true);
  });

  it("deriveSeed produces different seeds from different parents", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(deriveSeed(a)).not.toBe(deriveSeed(b));
  });
});
