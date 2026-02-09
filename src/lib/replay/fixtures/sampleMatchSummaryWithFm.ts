/**
 * Sample match_summary.json with failureModes block for exercising the
 * Behavior Profile panel in the replay viewer.
 *
 * This is a dev fixture only — it does not modify production artifact writers.
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
    fmClassifierVersion: "0.3.0-dev",
    byAgentId: {
      alpha: [
        { id: "FM-TIMEOUT-LOOP", count: 3, detectorSource: "heuristic-v2", rate: 0.2 },
        { id: "FM-INVALID-ACTION", count: 7, detectorSource: "validator", rate: 0.467 },
        { id: "FM-REPEAT-MOVE", count: 2, detectorSource: "heuristic-v2", rate: 0.133 },
        { id: "FM-NOOP-FALLBACK", count: 1, detectorSource: "heuristic-v2", rate: 0.067 },
        { id: "FM-RESOURCE-WASTE", count: 5, detectorSource: "scenario-specific", rate: 0.333 },
        { id: "FM-STALL", count: 1, detectorSource: "heuristic-v2", rate: 0.067 },
      ],
      beta: [
        { id: "FM-TIMEOUT-LOOP", count: 12, detectorSource: "heuristic-v2", rate: 0.8 },
        { id: "FM-INVALID-ACTION", count: 2, detectorSource: "validator", rate: 0.133 },
        { id: "FM-PANIC-BID", count: 4, detectorSource: "scenario-specific", rate: 0.267 },
      ],
    },
  },
} as const;
