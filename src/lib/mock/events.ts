import type { Event } from "@/lib/models";

/**
 * Events for match-001: "Strategic Dominance Championship - Round 1"
 * Agents: agent-001 (Strategos), agent-002 (Reflex), agent-004 (Sentinel)
 *
 * Narrative: A 3-episode match where Strategos employs long-term planning,
 * Reflex encounters a timeout error mid-game, and Sentinel maintains steady
 * defense. Strategos ultimately wins with a decisive endgame move.
 *
 * Timeline: 2025-01-15 10:00:00Z to 10:42:18Z
 */
export const mockEvents: Event[] = [
  // ─── Episode 1: "Opening Gambit" (evt-001 through evt-013) ───

  {
    id: "evt-001",
    ts: "2025-01-15T10:00:00Z",
    type: "match_started",
    severity: "info",
    summary: "Match initialized with 3 agents: Strategos, Reflex, Sentinel",
    details:
      "Match-001 started under ruleset-alpha-v2. Turn order determined by rating: Strategos (1847), Reflex (1623), Sentinel (1590). Each agent allocated 120s per turn.",
  },
  {
    id: "evt-002",
    ts: "2025-01-15T10:00:03Z",
    type: "state_updated",
    severity: "info",
    summary: "Initial board state distributed to all agents",
    details:
      "Board: 8x8 grid with 12 resource nodes. Starting positions assigned. Fog of war enabled. Each agent begins with 3 action points.",
  },
  {
    id: "evt-003",
    ts: "2025-01-15T10:00:45Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 1 began for Strategos",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
  },
  {
    id: "evt-004",
    ts: "2025-01-15T10:00:46Z",
    type: "observation_emitted",
    severity: "info",
    summary:
      "Strategos received initial observation: 4 visible resource nodes, 0 opponent positions",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Observation payload: visible_cells=24, resource_nodes=4, opponent_signals=0, action_points=3",
  },
  {
    id: "evt-005",
    ts: "2025-01-15T10:01:32Z",
    type: "action_submitted",
    severity: "info",
    summary: "Strategos submitted action: claim resource node R3 and advance to sector B4",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Action: MOVE(B4) + CLAIM(R3). Response time: 46200ms. Strategy detected: early resource control.",
  },
  {
    id: "evt-006",
    ts: "2025-01-15T10:01:34Z",
    type: "action_adjudicated",
    severity: "success",
    summary: "Strategos action validated. Resource control +2, position secured at B4",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Adjudication result: VALID. Resource R3 claimed (value: 2). Territory expanded by 3 cells.",
  },
  {
    id: "evt-007",
    ts: "2025-01-15T10:02:00Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 1 began for Reflex",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
  },
  {
    id: "evt-008",
    ts: "2025-01-15T10:02:18Z",
    type: "action_submitted",
    severity: "info",
    summary: "Reflex submitted action: rapid advance to sector D6, claim resource R7",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
    details:
      "Action: MOVE(D6) + CLAIM(R7). Response time: 17800ms. Strategy detected: aggressive early expansion.",
  },
  {
    id: "evt-009",
    ts: "2025-01-15T10:02:20Z",
    type: "action_adjudicated",
    severity: "success",
    summary: "Reflex action validated. Resource R7 claimed, forward position established",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
    details:
      "Adjudication result: VALID. Resource R7 claimed (value: 1). Position D6 is exposed but high-reward.",
  },
  {
    id: "evt-010",
    ts: "2025-01-15T10:03:00Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 1 began for Sentinel",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
  },
  {
    id: "evt-011",
    ts: "2025-01-15T10:03:52Z",
    type: "action_submitted",
    severity: "info",
    summary: "Sentinel submitted action: establish defensive perimeter at sectors A2-A3",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
    details:
      "Action: FORTIFY(A2) + FORTIFY(A3). Response time: 51500ms. Strategy detected: defensive consolidation.",
  },
  {
    id: "evt-012",
    ts: "2025-01-15T10:03:54Z",
    type: "action_adjudicated",
    severity: "success",
    summary:
      "Sentinel action validated. Defensive perimeter established with +1 fortification bonus",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
    details:
      "Adjudication result: VALID. Fortification bonus applied to A2 and A3. Defense rating: 4/5.",
  },
  {
    id: "evt-013",
    ts: "2025-01-15T10:04:00Z",
    type: "invariant_checked",
    severity: "success",
    summary: "End of round 1: all invariants passed",
    details: "Checked 3 invariants at round boundary. All agents acted within time limits.",
    invariantChecks: [
      {
        name: "max_turn_time",
        status: "pass",
        message: "All turns completed within 120s limit (max observed: 52s by Sentinel)",
      },
      {
        name: "valid_action_space",
        status: "pass",
        message: "All submitted actions were within the legal action space",
      },
      {
        name: "agent_count",
        status: "pass",
        message: "3/3 agents active and responsive",
      },
    ],
  },

  // ─── Episode 2: "Mid-Game Escalation" (evt-014 through evt-025) ───

  {
    id: "evt-014",
    ts: "2025-01-15T10:15:00Z",
    type: "state_updated",
    severity: "info",
    summary: "Round 2 state distributed. Resource nodes shifting, new opportunities revealed",
    details:
      "Board update: 2 new resource nodes spawned at E5, G2. Fog partially lifted. Strategos leads with 4 resources, Reflex has 2, Sentinel has 1 but strong defense.",
  },
  {
    id: "evt-015",
    ts: "2025-01-15T10:15:30Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 2 began for Strategos",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
  },
  {
    id: "evt-016",
    ts: "2025-01-15T10:16:48Z",
    type: "action_submitted",
    severity: "info",
    summary: "Strategos submitted action: strategic expansion to E5, reinforce B4 supply line",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Action: MOVE(E5) + REINFORCE(B4). Response time: 78200ms. Strategy detected: controlled expansion with supply chain.",
  },
  {
    id: "evt-017",
    ts: "2025-01-15T10:16:50Z",
    type: "action_adjudicated",
    severity: "success",
    summary: "Strategos expansion validated. E5 resource claimed, B4 supply line operational",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Adjudication result: VALID. Resource E5 claimed (value: 3). Supply line grants +1 action point next round. Total resources: 7.",
  },
  {
    id: "evt-018",
    ts: "2025-01-15T10:17:15Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 2 began for Reflex",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
  },
  {
    id: "evt-019",
    ts: "2025-01-15T10:18:42Z",
    type: "action_submitted",
    severity: "warning",
    summary: "Reflex submitted high-risk action: aggressive push into Strategos territory at C4",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
    details:
      "Action: ATTACK(C4) + MOVE(C5). Response time: 87100ms. WARNING: Response time unusually high for Reflex (typical: <20s). Action targets opponent-controlled territory.",
  },
  {
    id: "evt-020",
    ts: "2025-01-15T10:19:15Z",
    type: "agent_error",
    severity: "error",
    summary: "Reflex agent connection timeout during action confirmation handshake",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
    details:
      "Error: TIMEOUT after 30000ms waiting for action confirmation ACK. Agent process reported high memory usage (92%). The submitted action at evt-019 will be evaluated but Reflex forfeits remaining action points this turn.",
  },
  {
    id: "evt-021",
    ts: "2025-01-15T10:19:18Z",
    type: "rule_triggered",
    severity: "warning",
    summary: "Timeout penalty rule applied to Reflex: -1 action point next round",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
    details:
      "Rule: TIMEOUT_PENALTY (ruleset-alpha-v2 section 4.3). Penalty: forfeit 1 action point in the following round. Note: Reflex has 1 prior timeout warning. A second penalty will result in disqualification review.",
  },
  {
    id: "evt-022",
    ts: "2025-01-15T10:20:00Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 2 began for Sentinel",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
  },
  {
    id: "evt-023",
    ts: "2025-01-15T10:21:05Z",
    type: "action_submitted",
    severity: "info",
    summary: "Sentinel submitted action: reinforce perimeter at A2, extend to B2",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
    details:
      "Action: REINFORCE(A2) + FORTIFY(B2). Response time: 64800ms. Strategy detected: expanding defensive line toward center.",
  },
  {
    id: "evt-024",
    ts: "2025-01-15T10:21:07Z",
    type: "action_adjudicated",
    severity: "success",
    summary: "Sentinel reinforcement validated. Defense rating upgraded to 5/5 at A2",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
    details:
      "Adjudication result: VALID. A2 now at maximum fortification. B2 fortified at level 2. Sentinel controls a 4-cell defensive block.",
  },
  {
    id: "evt-025",
    ts: "2025-01-15T10:21:30Z",
    type: "invariant_checked",
    severity: "warning",
    summary: "End of round 2: turn time invariant flagged warning for Reflex",
    details:
      "Checked 3 invariants at round boundary. One warning issued for turn time approaching limit.",
    invariantChecks: [
      {
        name: "max_turn_time",
        status: "pass",
        message:
          "All turns technically within 120s, but Reflex at 87s + 30s timeout = 117s effective. Warning threshold exceeded.",
      },
      {
        name: "valid_action_space",
        status: "pass",
        message:
          "All submitted actions were within the legal action space. Reflex attack on C4 is legal but contested.",
      },
      {
        name: "agent_count",
        status: "fail",
        message:
          "Reflex experienced a timeout event. Agent is still active but flagged for monitoring. 3/3 agents nominally present.",
      },
    ],
  },

  // ─── Episode 3: "Endgame Resolution" (evt-026 through evt-039) ───

  {
    id: "evt-026",
    ts: "2025-01-15T10:30:00Z",
    type: "state_updated",
    severity: "info",
    summary: "Final round state distributed. Strategos holds commanding resource lead",
    details:
      "Board update: Final round. Scores - Strategos: 7 resources + 2 territory bonus, Reflex: 2 resources (penalized), Sentinel: 1 resource + 4 defense bonus. 3 unclaimed resource nodes remain.",
  },
  {
    id: "evt-027",
    ts: "2025-01-15T10:30:30Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 3 (final) began for Strategos",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
  },
  {
    id: "evt-028",
    ts: "2025-01-15T10:30:32Z",
    type: "observation_emitted",
    severity: "info",
    summary: "Strategos received full board observation: fog of war lifted for final round",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Observation payload: visible_cells=64 (full board), resource_nodes=3 unclaimed, opponent_positions=[D6(Reflex), A2-B2(Sentinel)], action_points=4 (supply bonus active).",
  },
  {
    id: "evt-029",
    ts: "2025-01-15T10:32:15Z",
    type: "action_submitted",
    severity: "info",
    summary:
      "Strategos submitted decisive action: claim remaining resources at F7, G2 and lock territory",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Action: MOVE(F7) + CLAIM(F7) + CLAIM(G2) + LOCK_TERRITORY(center). Response time: 103400ms. Strategy detected: endgame resource sweep with territory lockdown. Uses all 4 action points.",
  },
  {
    id: "evt-030",
    ts: "2025-01-15T10:32:18Z",
    type: "action_adjudicated",
    severity: "success",
    summary: "Strategos endgame move validated. Two resources claimed, central territory locked",
    relatedAgentId: "agent-001",
    relatedRunId: "run-001",
    details:
      "Adjudication result: VALID. Resources F7 (value: 2) and G2 (value: 3) claimed. Territory lock prevents opponent movement through center for remainder of match. Total score: 14.",
  },
  {
    id: "evt-031",
    ts: "2025-01-15T10:33:00Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 3 (final) began for Reflex",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
  },
  {
    id: "evt-032",
    ts: "2025-01-15T10:33:28Z",
    type: "action_submitted",
    severity: "info",
    summary: "Reflex submitted recovery action: retreat to E7 and claim last resource H1",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
    details:
      "Action: MOVE(E7) + CLAIM(H1). Response time: 27500ms. Response time normalized. Agent operating with 2 action points (1 penalized). Strategy detected: damage limitation.",
  },
  {
    id: "evt-033",
    ts: "2025-01-15T10:33:30Z",
    type: "action_adjudicated",
    severity: "info",
    summary:
      "Reflex recovery action validated. Resource H1 claimed but insufficient to change outcome",
    relatedAgentId: "agent-002",
    relatedRunId: "run-002",
    details:
      "Adjudication result: VALID. Resource H1 claimed (value: 1). Reflex total score: 4. Insufficient to challenge Strategos lead (14).",
  },
  {
    id: "evt-034",
    ts: "2025-01-15T10:34:00Z",
    type: "turn_started",
    severity: "info",
    summary: "Turn 3 (final) began for Sentinel",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
  },
  {
    id: "evt-035",
    ts: "2025-01-15T10:35:10Z",
    type: "action_submitted",
    severity: "info",
    summary: "Sentinel submitted action: final fortification of entire defensive block",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
    details:
      "Action: FORTIFY(A2) + FORTIFY(A3) + FORTIFY(B2). Response time: 69300ms. Strategy detected: maximize defense bonus for final scoring.",
  },
  {
    id: "evt-036",
    ts: "2025-01-15T10:35:12Z",
    type: "action_adjudicated",
    severity: "success",
    summary: "Sentinel fortification validated. Maximum defense achieved across entire perimeter",
    relatedAgentId: "agent-004",
    relatedRunId: "run-003",
    details:
      "Adjudication result: VALID. All positions at max fortification. Defense bonus: +6. Sentinel total score: 7 (1 resource + 6 defense).",
  },
  {
    id: "evt-037",
    ts: "2025-01-15T10:40:00Z",
    type: "invariant_checked",
    severity: "success",
    summary: "Final invariant check: all invariants passed. Match eligible for completion",
    details:
      "Final round invariant verification. All 3 invariants satisfied. Match result can be certified.",
    invariantChecks: [
      {
        name: "max_turn_time",
        status: "pass",
        message: "All final-round turns within limit. Max: Strategos at 103s.",
      },
      {
        name: "valid_action_space",
        status: "pass",
        message:
          "All final-round actions legal. Territory lock by Strategos verified against ruleset.",
      },
      {
        name: "agent_count",
        status: "pass",
        message: "3/3 agents completed all rounds. No disconnections in final episode.",
      },
    ],
  },
  {
    id: "evt-038",
    ts: "2025-01-15T10:42:00Z",
    type: "state_updated",
    severity: "info",
    summary: "Final scores calculated and verified",
    details:
      "Final standings: 1st Strategos (14 pts), 2nd Sentinel (7 pts), 3rd Reflex (4 pts). Score breakdown includes resource values, territory bonuses, defense bonuses, and penalties.",
  },
  {
    id: "evt-039",
    ts: "2025-01-15T10:42:18Z",
    type: "match_ended",
    severity: "success",
    summary: "Match completed. Winner: Strategos with 14 points",
    details:
      "Match-001 concluded after 3 episodes, 9 turns, 42 minutes 18 seconds. Strategos dominated through consistent resource acquisition and a decisive territory lock in the endgame. Reflex was hampered by a mid-game timeout. Sentinel placed second through strong defensive play.",
  },
];
