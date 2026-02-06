import type { Flow } from "@/lib/models";

export const mockFlows: Flow[] = [
  // ── Flow 1: Match Lifecycle ──
  {
    id: "flow-001",
    name: "Match Lifecycle",
    description:
      "Governs the full lifecycle of a match from scheduling through completion or error. Manages state transitions between match phases and enforces structural invariants.",
    states: [
      {
        id: "state-ml-scheduled",
        name: "scheduled",
        description:
          "Match is configured and awaiting its start time. All agents have been assigned and the ruleset is locked.",
        isInitial: true,
      },
      {
        id: "state-ml-initializing",
        name: "initializing",
        description:
          "Match engine is booting up, loading rulesets, connecting to agents, and distributing initial state.",
      },
      {
        id: "state-ml-in-progress",
        name: "in_progress",
        description:
          "Match is actively running. Agents are taking turns, actions are being adjudicated, and episodes are advancing.",
      },
      {
        id: "state-ml-adjudicating",
        name: "adjudicating",
        description:
          "Final scores are being computed and verified. Invariants undergo a final check before results are certified.",
      },
      {
        id: "state-ml-completed",
        name: "completed",
        description:
          "Match has finished successfully. Final scores are certified, rankings updated, and results available.",
        isTerminal: true,
      },
      {
        id: "state-ml-error",
        name: "error",
        description:
          "Match encountered an unrecoverable error. Partial results may be available for analysis. Requires manual review.",
        isTerminal: true,
      },
    ],
    triggers: [
      {
        id: "trigger-ml-start",
        name: "match_start",
        condition: "current_time >= match.scheduledStartTime && all_agents_connected",
        action: "Initialize match engine, load ruleset, distribute initial state to all agents",
      },
      {
        id: "trigger-ml-initialized",
        name: "initialization_complete",
        condition: "all_agents_acknowledged_initial_state && engine_health === 'ready'",
        action: "Begin first episode, emit match_started event, start turn clock",
      },
      {
        id: "trigger-ml-timeout",
        name: "match_timeout",
        condition: "elapsed_time > match.maxDuration || consecutive_agent_timeouts >= 3",
        action: "Halt match, calculate partial scores, emit match_ended event with timeout reason",
      },
      {
        id: "trigger-ml-error",
        name: "system_error",
        condition: "engine_health === 'critical' || unrecoverable_exception_thrown",
        action:
          "Immediately halt match, preserve state snapshot for debugging, emit error event, notify administrators",
      },
      {
        id: "trigger-ml-completion",
        name: "match_completion",
        condition: "all_episodes_completed && final_scores_computed",
        action:
          "Enter adjudication phase, run final invariant checks, certify results if all checks pass",
      },
      {
        id: "trigger-ml-certified",
        name: "results_certified",
        condition: "all_final_invariants_passed && scores_verified",
        action:
          "Emit match_ended event with final scores, update agent ratings, archive match data",
      },
    ],
    invariants: [
      {
        id: "inv-ml-turn-time",
        name: "max_turn_time",
        expression: "agent.turnDuration <= ruleset.maxTurnTimeSeconds",
        severity: "error",
        description:
          "No single agent turn may exceed the maximum turn time defined in the ruleset. Violations trigger a timeout penalty and may lead to disqualification after repeated offenses.",
      },
      {
        id: "inv-ml-action-space",
        name: "valid_action_space",
        expression: "ruleset.legalActions.includes(agent.submittedAction.type)",
        severity: "error",
        description:
          "Every submitted action must be within the legal action space defined by the active ruleset. Invalid actions are rejected and the agent forfeits their turn.",
      },
      {
        id: "inv-ml-agent-count",
        name: "agent_count",
        expression:
          "match.activeAgents.length >= ruleset.minAgents && match.activeAgents.length <= ruleset.maxAgents",
        severity: "critical",
        description:
          "The number of active agents must remain within the bounds specified by the ruleset. If agents disconnect and the count drops below minimum, the match enters error state.",
      },
      {
        id: "inv-ml-score-integrity",
        name: "score_integrity",
        expression: "sum(agent.scores) <= match.totalAvailablePoints",
        severity: "critical",
        description:
          "The sum of all agent scores must not exceed the total available points in the match. A violation indicates a scoring engine bug and requires immediate investigation.",
      },
      {
        id: "inv-ml-episode-order",
        name: "episode_ordering",
        expression: "episode[n].startedAt > episode[n-1].endedAt",
        severity: "warning",
        description:
          "Episodes must execute in strict sequential order with no temporal overlap. Warnings here may indicate clock synchronization issues between match engine nodes.",
      },
    ],
    transitions: [
      {
        id: "trans-ml-01",
        from: "state-ml-scheduled",
        to: "state-ml-initializing",
        trigger: "trigger-ml-start",
        guard: "all agents must be registered and ruleset must be valid",
      },
      {
        id: "trans-ml-02",
        from: "state-ml-initializing",
        to: "state-ml-in-progress",
        trigger: "trigger-ml-initialized",
        guard: "engine health check must pass and all agents must acknowledge",
      },
      {
        id: "trans-ml-03",
        from: "state-ml-in-progress",
        to: "state-ml-adjudicating",
        trigger: "trigger-ml-completion",
      },
      {
        id: "trans-ml-04",
        from: "state-ml-adjudicating",
        to: "state-ml-completed",
        trigger: "trigger-ml-certified",
      },
      {
        id: "trans-ml-05",
        from: "state-ml-initializing",
        to: "state-ml-error",
        trigger: "trigger-ml-error",
        guard: "error must be unrecoverable (retries exhausted or critical failure)",
      },
      {
        id: "trans-ml-06",
        from: "state-ml-in-progress",
        to: "state-ml-error",
        trigger: "trigger-ml-error",
      },
      {
        id: "trans-ml-07",
        from: "state-ml-in-progress",
        to: "state-ml-error",
        trigger: "trigger-ml-timeout",
        guard: "timeout must be match-level (not individual turn timeout)",
      },
      {
        id: "trans-ml-08",
        from: "state-ml-adjudicating",
        to: "state-ml-error",
        trigger: "trigger-ml-error",
        guard: "final invariant check must have failed with critical severity",
      },
    ],
  },

  // ── Flow 2: Agent Turn ──
  {
    id: "flow-002",
    name: "Agent Turn",
    description:
      "Controls the lifecycle of a single agent turn within a match episode. Defines the sequence from receiving a turn notification through action evaluation.",
    states: [
      {
        id: "state-at-awaiting",
        name: "awaiting_turn",
        description:
          "Agent is idle, waiting for the match engine to signal that it is their turn to act.",
        isInitial: true,
      },
      {
        id: "state-at-observing",
        name: "observing",
        description:
          "Agent has been notified of their turn and is receiving the current game state observation. Processing begins.",
      },
      {
        id: "state-at-deciding",
        name: "deciding",
        description:
          "Agent has received the full observation and is computing its action. The turn timer is actively counting down.",
      },
      {
        id: "state-at-acting",
        name: "acting",
        description:
          "Agent has submitted an action and is awaiting confirmation from the match engine. Action is being validated.",
      },
      {
        id: "state-at-evaluated",
        name: "evaluated",
        description:
          "The agent's action has been adjudicated. Results are recorded and the agent returns to awaiting the next turn.",
        isTerminal: true,
      },
    ],
    triggers: [
      {
        id: "trigger-at-turn-signal",
        name: "turn_signal",
        condition: "match.currentTurnAgent === agent.id && episode.isActive",
        action: "Emit turn_started event, begin observation delivery to agent",
      },
      {
        id: "trigger-at-observation-delivered",
        name: "observation_delivered",
        condition: "agent.acknowledgedObservation && observation.isComplete",
        action:
          "Start turn timer, transition agent to deciding state, emit observation_emitted event",
      },
      {
        id: "trigger-at-action-received",
        name: "action_received",
        condition: "agent.submittedAction !== null && turnTimer.remaining > 0",
        action:
          "Validate action format, emit action_submitted event, forward to adjudication engine",
      },
      {
        id: "trigger-at-adjudication-complete",
        name: "adjudication_complete",
        condition: "adjudicator.result !== null",
        action:
          "Apply action effects to game state, emit action_adjudicated event, update agent score",
      },
      {
        id: "trigger-at-turn-timeout",
        name: "turn_timeout",
        condition: "turnTimer.remaining <= 0 && agent.submittedAction === null",
        action:
          "Emit agent_error event with timeout, apply timeout penalty, forfeit agent turn, emit rule_triggered event",
      },
    ],
    invariants: [
      {
        id: "inv-at-response-time",
        name: "response_time_limit",
        expression: "agent.responseTimeMs <= ruleset.maxTurnTimeMs",
        severity: "error",
        description:
          "Agent must submit an action within the allotted turn time. Exceeding this limit results in a timeout penalty and potential disqualification after repeated violations.",
      },
      {
        id: "inv-at-action-validity",
        name: "action_format_valid",
        expression:
          "actionSchema.validate(agent.submittedAction) === true && action.targetCells.every(c => board.isValid(c))",
        severity: "error",
        description:
          "Submitted action must conform to the expected schema and reference valid board positions. Malformed actions are rejected without penalty but the agent must resubmit.",
      },
      {
        id: "inv-at-single-action",
        name: "single_action_per_turn",
        expression: "agent.actionsThisTurn <= 1",
        severity: "critical",
        description:
          "An agent may submit at most one action per turn. Duplicate submissions indicate a protocol violation and the second submission is ignored.",
      },
      {
        id: "inv-at-observation-ack",
        name: "observation_acknowledged",
        expression: "agent.observationAckTime <= observationDeliveryTime + 5000",
        severity: "warning",
        description:
          "Agent should acknowledge receipt of observation within 5 seconds of delivery. Delayed acknowledgment may indicate agent health issues.",
      },
    ],
    transitions: [
      {
        id: "trans-at-01",
        from: "state-at-awaiting",
        to: "state-at-observing",
        trigger: "trigger-at-turn-signal",
      },
      {
        id: "trans-at-02",
        from: "state-at-observing",
        to: "state-at-deciding",
        trigger: "trigger-at-observation-delivered",
        guard: "observation payload must be complete and non-empty",
      },
      {
        id: "trans-at-03",
        from: "state-at-deciding",
        to: "state-at-acting",
        trigger: "trigger-at-action-received",
        guard: "action must pass format validation before entering acting state",
      },
      {
        id: "trans-at-04",
        from: "state-at-acting",
        to: "state-at-evaluated",
        trigger: "trigger-at-adjudication-complete",
      },
      {
        id: "trans-at-05",
        from: "state-at-deciding",
        to: "state-at-evaluated",
        trigger: "trigger-at-turn-timeout",
        guard: "turn timer must have fully expired with no action submitted",
      },
      {
        id: "trans-at-06",
        from: "state-at-observing",
        to: "state-at-evaluated",
        trigger: "trigger-at-turn-timeout",
        guard:
          "agent failed to acknowledge observation within timeout period, treated as full turn timeout",
      },
    ],
  },
];
