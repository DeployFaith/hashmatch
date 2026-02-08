import { describe, it, expect } from "vitest";
import { mapStatusToState, deriveViewerState } from "../src/hooks/useMatchLive.js";
import type { LiveViewerState } from "../src/hooks/useMatchLive.js";
import type { LiveMatchStatus } from "../src/lib/matches/types.js";

// ---------------------------------------------------------------------------
// mapStatusToState
// ---------------------------------------------------------------------------

describe("mapStatusToState", () => {
  it('maps "running" to "live"', () => {
    expect(mapStatusToState("running")).toBe("live");
  });

  it('maps "waiting" to "waiting"', () => {
    expect(mapStatusToState("waiting")).toBe("waiting");
  });

  it('maps "finished" to "completed"', () => {
    expect(mapStatusToState("finished")).toBe("completed");
  });

  it("maps unrecognised values to unknown", () => {
    // Cast to satisfy TS — runtime defensiveness
    expect(mapStatusToState("something_else" as LiveMatchStatus)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// deriveViewerState
// ---------------------------------------------------------------------------

describe("deriveViewerState", () => {
  it("returns base state when SSE status is null (no snapshot)", () => {
    expect(deriveViewerState("live", null, "running")).toBe("live");
    expect(deriveViewerState("connecting", null, "running")).toBe("connecting");
    expect(deriveViewerState("unknown", null, "finished")).toBe("unknown");
  });

  it('returns "completed" when SSE status is "complete" regardless of base state', () => {
    expect(deriveViewerState("live", "complete", "running")).toBe("completed");
    expect(deriveViewerState("connecting", "complete", "running")).toBe("completed");
    expect(deriveViewerState("waiting", "complete", "finished")).toBe("completed");
  });

  it('returns "completed" when SSE status is "error" and API says finished', () => {
    expect(deriveViewerState("live", "error", "finished")).toBe("completed");
    expect(deriveViewerState("connecting", "error", "finished")).toBe("completed");
  });

  it("returns base state when SSE is error but API is not finished", () => {
    expect(deriveViewerState("live", "error", "running")).toBe("live");
    expect(deriveViewerState("live", "error", "waiting")).toBe("live");
  });

  it('returns base state when SSE is "loading"', () => {
    expect(deriveViewerState("live", "loading", "running")).toBe("live");
    expect(deriveViewerState("connecting", "loading", "running")).toBe("connecting");
  });

  it("SSE complete takes priority over other API statuses", () => {
    expect(deriveViewerState("live", "complete", "running")).toBe("completed");
    expect(deriveViewerState("live", "complete", "waiting")).toBe("completed");
  });

  it("preserves terminal states as base when SSE is null", () => {
    const terminals: LiveViewerState[] = ["completed", "crashed", "unknown"];
    for (const state of terminals) {
      expect(deriveViewerState(state, null, "finished")).toBe(state);
    }
  });
});
