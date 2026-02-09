// TODO(terminology-alignment): "fixture" here means "static test data" for the
// UI panel, not a scripted agent. This usage is fine, but the matchId
// "m_fixture_fm_001" should be renamed to "m_sample_fm_001" to avoid confusion
// with the agent-fixture terminology being phased out. Category: (A) rename only.
/**
 * Sample match_summary.json with failureModes block for exercising the
 * Behavior Profile panel in the replay viewer.
 *
 * This is a dev fixture only — it does not modify production artifact writers.
 *
 * detectorSource values follow the canonical DetectorSource type:
 *   "core" | `scenario:${string}`
 */
export const SAMPLE_MATCH_SUMMARY_WITH_FM = {
  matchId: "m_fixture_fm_001",
  matchKey: "RR:alpha-vs-beta:round1",
  seed: 42,
  agentIds: ["alpha", "beta"],
  scores: { alpha: 320, beta: 280 },
  timeoutsPerAgent: { alpha: 0, beta: 1 },
  winner: "alpha",
  turns: 15,
  reason: "completed",
  failureModes: {
    fmClassifierVersion: "core-1",
    byAgentId: {
      alpha: [
        { id: "FM-TIMEOUT-LOOP", count: 3, detectorSource: "core", rate: 0.2 },
        { id: "FM-INVALID-ACTION", count: 7, detectorSource: "core", rate: 0.467 },
        { id: "FM-REPEAT-MOVE", count: 2, detectorSource: "core", rate: 0.133 },
        { id: "FM-NOOP-FALLBACK", count: 1, detectorSource: "core", rate: 0.067 },
        { id: "FM-RESOURCE-WASTE", count: 5, detectorSource: "scenario:heist", rate: 0.333 },
        { id: "FM-STALL", count: 1, detectorSource: "core", rate: 0.067 },
      ],
      beta: [
        { id: "FM-TIMEOUT-LOOP", count: 12, detectorSource: "core", rate: 0.8 },
        { id: "FM-INVALID-ACTION", count: 2, detectorSource: "core", rate: 0.133 },
        { id: "FM-PANIC-BID", count: 4, detectorSource: "scenario:heist", rate: 0.267 },
      ],
    },
  },
} as const;
