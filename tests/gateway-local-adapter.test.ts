import { describe, expect, it, vi } from "vitest";
import { createLocalAdapter } from "../src/gateway/localAdapter.js";

const baseRequest = {
  protocolVersion: "0.1.0" as const,
  matchId: "match-1",
  turn: 1,
  agentId: "agent-1",
  deadlineMs: 50,
  turnStartedAt: new Date().toISOString(),
  gameId: "test-game",
  gameVersion: "0.1.0",
  observation: { hint: "go" },
};

describe("createLocalAdapter", () => {
  it("returns action and ok transcript on success", async () => {
    const adapter = createLocalAdapter((observation) => ({ action: observation }));
    const fallback = { fallback: true };

    const result = await adapter.requestAction(baseRequest, fallback);

    expect(result.action).toEqual({ action: baseRequest.observation });
    expect(result.transcript.status).toBe("ok");
    expect(result.transcript.fallbackApplied).toBe(false);
    expect(result.transcript.observationBytes).toBeGreaterThan(0);
    expect(result.transcript.actionBytes).toBeGreaterThan(0);
  });

  it("uses fallback on timeout", async () => {
    vi.useFakeTimers();
    const adapter = createLocalAdapter(
      () => new Promise((resolve) => setTimeout(() => resolve({ action: "late" }), 100)),
    );
    const fallback = { action: "fallback" };

    const promise = adapter.requestAction({ ...baseRequest, deadlineMs: 10 }, fallback);
    await vi.advanceTimersByTimeAsync(20);
    const result = await promise;
    vi.useRealTimers();

    expect(result.action).toEqual(fallback);
    expect(result.transcript.status).toBe("timeout");
    expect(result.transcript.fallbackApplied).toBe(true);
  });

  it("uses fallback on error", async () => {
    const adapter = createLocalAdapter(() => {
      throw new Error("boom");
    });
    const fallback = { action: "fallback" };

    const result = await adapter.requestAction(baseRequest, fallback);

    expect(result.action).toEqual(fallback);
    expect(result.transcript.status).toBe("error");
    expect(result.transcript.errorMessage).toContain("boom");
    expect(result.transcript.fallbackApplied).toBe(true);
  });
});
