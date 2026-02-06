import type { Match } from "@/lib/models";

export const mockMatches: Match[] = [
  // ── match-001: Completed, detailed match with 3 episodes and full event history ──
  {
    id: "match-001",
    title: "Strategic Dominance Championship - Round 1",
    status: "completed",
    startedAt: "2025-01-15T10:00:00Z",
    endedAt: "2025-01-15T10:42:18Z",
    agents: ["agent-001", "agent-002", "agent-004"],
    rulesetId: "ruleset-alpha-v2",
    episodes: [
      {
        id: "ep-001",
        title: "Opening Gambit",
        startedAt: "2025-01-15T10:00:00Z",
        eventIds: [
          "evt-001",
          "evt-002",
          "evt-003",
          "evt-004",
          "evt-005",
          "evt-006",
          "evt-007",
          "evt-008",
          "evt-009",
          "evt-010",
          "evt-011",
          "evt-012",
          "evt-013",
        ],
      },
      {
        id: "ep-002",
        title: "Mid-Game Escalation",
        startedAt: "2025-01-15T10:15:00Z",
        eventIds: [
          "evt-014",
          "evt-015",
          "evt-016",
          "evt-017",
          "evt-018",
          "evt-019",
          "evt-020",
          "evt-021",
          "evt-022",
          "evt-023",
          "evt-024",
          "evt-025",
        ],
      },
      {
        id: "ep-003",
        title: "Endgame Resolution",
        startedAt: "2025-01-15T10:30:00Z",
        eventIds: [
          "evt-026",
          "evt-027",
          "evt-028",
          "evt-029",
          "evt-030",
          "evt-031",
          "evt-032",
          "evt-033",
          "evt-034",
          "evt-035",
          "evt-036",
          "evt-037",
          "evt-038",
          "evt-039",
        ],
      },
    ],
    score: {
      "agent-001": 14,
      "agent-002": 4,
      "agent-004": 7,
    },
  },

  // ── match-002: Completed, Oracle vs Harmony ──
  {
    id: "match-002",
    title: "Prediction vs Cooperation - Exhibition Match",
    status: "completed",
    startedAt: "2025-01-14T16:00:00Z",
    endedAt: "2025-01-14T16:38:45Z",
    agents: ["agent-003", "agent-006"],
    rulesetId: "ruleset-beta-v1",
    episodes: [
      {
        id: "ep-004",
        title: "Calibration Phase",
        startedAt: "2025-01-14T16:00:00Z",
        eventIds: [],
      },
      {
        id: "ep-005",
        title: "Negotiation Round",
        startedAt: "2025-01-14T16:15:00Z",
        eventIds: [],
      },
    ],
    score: {
      "agent-003": 11,
      "agent-006": 9,
    },
  },

  // ── match-003: In progress, Strategos vs Chaos ──
  {
    id: "match-003",
    title: "Adversarial Stress Test - Session 7",
    status: "in_progress",
    startedAt: "2025-01-15T14:00:00Z",
    agents: ["agent-001", "agent-005"],
    rulesetId: "ruleset-alpha-v2",
    episodes: [
      {
        id: "ep-006",
        title: "Probe Phase",
        startedAt: "2025-01-15T14:00:00Z",
        eventIds: [],
      },
    ],
  },

  // ── match-004: Scheduled, 3-way match ──
  {
    id: "match-004",
    title: "Tri-Agent Reasoning Challenge",
    status: "scheduled",
    agents: ["agent-002", "agent-003", "agent-006"],
    rulesetId: "ruleset-gamma-v1",
    episodes: [],
  },

  // ── match-005: Cancelled, was Sentinel vs Chaos ──
  {
    id: "match-005",
    title: "Boundary Defense Evaluation",
    status: "cancelled",
    agents: ["agent-004", "agent-005"],
    rulesetId: "ruleset-alpha-v2",
    episodes: [],
  },

  // ── match-006: Error state, Chaos caused a system fault ──
  {
    id: "match-006",
    title: "Edge Case Discovery Run #12",
    status: "error",
    startedAt: "2025-01-13T09:00:00Z",
    agents: ["agent-005", "agent-001"],
    rulesetId: "ruleset-alpha-v2",
    episodes: [
      {
        id: "ep-007",
        title: "Initial Probing",
        startedAt: "2025-01-13T09:00:00Z",
        eventIds: [],
      },
    ],
  },

  // ── match-007: Completed, Reflex vs Harmony ──
  {
    id: "match-007",
    title: "Speed vs Consensus - Duel Series #3",
    status: "completed",
    startedAt: "2025-01-14T11:00:00Z",
    endedAt: "2025-01-14T11:29:12Z",
    agents: ["agent-002", "agent-006"],
    rulesetId: "ruleset-beta-v1",
    episodes: [
      {
        id: "ep-008",
        title: "Rapid Exchange",
        startedAt: "2025-01-14T11:00:00Z",
        eventIds: [],
      },
      {
        id: "ep-009",
        title: "Consensus Attempt",
        startedAt: "2025-01-14T11:12:00Z",
        eventIds: [],
      },
    ],
    score: {
      "agent-002": 8,
      "agent-006": 10,
    },
  },

  // ── match-008: Scheduled, 4-way tournament match ──
  {
    id: "match-008",
    title: "League Qualifier - Group A Final",
    status: "scheduled",
    agents: ["agent-001", "agent-003", "agent-004", "agent-006"],
    rulesetId: "ruleset-gamma-v1",
    episodes: [],
  },
];
