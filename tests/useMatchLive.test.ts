import { describe, it, expect } from "vitest";
import { mapStatusToState, deriveViewerState } from "../src/hooks/useMatchLive.js";
import type { LiveViewerState } from "../src/hooks/useMatchLive.js";
import type { MatchRunState } from "../src/lib/matches/types.js";

// ---------------------------------------------------------------------------
// mapStatusToState
// ---------------------------------------------------------------------------

describe("mapStatusToState", () => {
  it('maps "running" to "live"', () => {
    expect(mapStatusToState("running")).toBe("live");
  });

  it('maps "completed" to "completed"', () => {
    expect(mapStatusToState("completed")).toBe("completed");
  });

  it('maps "crashed" to "crashed"', () => {
    expect(mapStatusToState("crashed")).toBe("crashed");
  });

  it('maps "unknown" to "unknown"', () => {
    expect(mapStatusToState("unknown")).toBe("unknown");
  });

  it("maps unrecognised values to unknown", () => {
    // Cast to satisfy TS — runtime defensiveness
    expect(mapStatusToState("something_else" as MatchRunState)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// deriveViewerState
// ---------------------------------------------------------------------------

describe("deriveViewerState", () => {
  it("returns base state when SSE status is null (no snapshot)", () => {
    expect(deriveViewerState("live", null, "running")).toBe("live");
    expect(deriveViewerState("connecting", null, "running")).toBe("connecting");
    expect(deriveViewerState("unknown", null, "unknown")).toBe("unknown");
  });

  it('returns "completed" when SSE status is "complete" regardless of base state', () => {
    expect(deriveViewerState("live", "complete", "running")).toBe("completed");
    expect(deriveViewerState("connecting", "complete", "running")).toBe("completed");
    expect(deriveViewerState("crashed", "complete", "crashed")).toBe("completed");
  });

  it('returns "crashed" when SSE status is "error" and API says crashed', () => {
    expect(deriveViewerState("live", "error", "crashed")).toBe("crashed");
    expect(deriveViewerState("connecting", "error", "crashed")).toBe("crashed");
  });

  it("returns base state when SSE is error but API is not crashed", () => {
    expect(deriveViewerState("live", "error", "running")).toBe("live");
    expect(deriveViewerState("live", "error", "completed")).toBe("live");
    expect(deriveViewerState("live", "error", "unknown")).toBe("live");
  });

  it('returns base state when SSE is "loading"', () => {
    expect(deriveViewerState("live", "loading", "running")).toBe("live");
    expect(deriveViewerState("connecting", "loading", "running")).toBe("connecting");
  });

  it("SSE complete takes priority over crashed API status", () => {
    // If SSE says complete but API reports crashed, SSE wins (it received match_end)
    expect(deriveViewerState("live", "complete", "crashed")).toBe("completed");
  });

  it("preserves terminal states as base when SSE is null", () => {
    const terminals: LiveViewerState[] = ["completed", "crashed", "unknown"];
    for (const state of terminals) {
      expect(deriveViewerState(state, null, "unknown")).toBe(state);
    }
  });
});
