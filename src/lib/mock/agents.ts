import type { Agent } from "@/lib/models";

export const mockAgents: Agent[] = [
  {
    id: "agent-001",
    name: "Strategos",
    avatar: "S",
    description:
      "Strategic planning agent specializing in long-term optimization and resource allocation. Excels in multi-step reasoning.",
    tags: ["strategic", "optimizer", "v2"],
    rating: 1847,
    reliability: 0.94,
    lastSeen: "2025-01-15T14:30:00Z",
    capabilities: ["planning", "negotiation", "risk-assessment", "multi-agent-coordination"],
  },
  {
    id: "agent-002",
    name: "Reflex",
    avatar: "R",
    description:
      "Fast-response reactive agent. Optimized for low-latency decisions in time-constrained scenarios.",
    tags: ["reactive", "fast", "v3"],
    rating: 1623,
    reliability: 0.88,
    lastSeen: "2025-01-15T14:28:00Z",
    capabilities: ["rapid-response", "pattern-matching", "adaptation"],
  },
  {
    id: "agent-003",
    name: "Oracle",
    avatar: "O",
    description:
      "Prediction-focused agent with strong probabilistic reasoning. High accuracy on estimation tasks.",
    tags: ["predictor", "probabilistic", "v1"],
    rating: 1756,
    reliability: 0.91,
    lastSeen: "2025-01-15T12:00:00Z",
    capabilities: ["prediction", "estimation", "bayesian-reasoning", "calibration"],
  },
  {
    id: "agent-004",
    name: "Sentinel",
    avatar: "T",
    description:
      "Defense-oriented agent specializing in invariant enforcement and rule compliance monitoring.",
    tags: ["defensive", "rules", "monitor", "v2"],
    rating: 1590,
    reliability: 0.97,
    lastSeen: "2025-01-15T14:25:00Z",
    capabilities: ["invariant-checking", "rule-enforcement", "anomaly-detection"],
  },
  {
    id: "agent-005",
    name: "Chaos",
    avatar: "C",
    description:
      "Adversarial testing agent designed to probe system boundaries and find edge cases.",
    tags: ["adversarial", "testing", "v1"],
    rating: 1410,
    reliability: 0.72,
    lastSeen: "2025-01-14T22:00:00Z",
    capabilities: ["boundary-testing", "adversarial-probing", "edge-case-discovery"],
  },
  {
    id: "agent-006",
    name: "Harmony",
    avatar: "H",
    description:
      "Cooperative agent focused on multi-agent collaboration and consensus-building strategies.",
    tags: ["cooperative", "consensus", "v2"],
    rating: 1680,
    reliability: 0.93,
    lastSeen: "2025-01-15T13:45:00Z",
    capabilities: ["collaboration", "consensus-building", "communication", "mediation"],
  },
];
