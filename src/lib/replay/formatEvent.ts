/**
 * Scenario-aware event formatter for the live/replay viewer.
 *
 * Pure function — no React, no side effects, no browser APIs.
 * Deterministic: same (event, scenarioName) → same output.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FormattedEvent {
  /** Primary human-readable summary. */
  primaryText: string;
  /** Optional secondary details (rejection reasons, debugging info). */
  details?: string;
  /** Badge type for visual distinction. */
  badge: "action" | "wait" | "invalid" | "system" | "score" | "end";
}

// ---------------------------------------------------------------------------
// Safe helpers
// ---------------------------------------------------------------------------

/** Safely stringify a value, truncating to `maxLen` characters. Never throws. */
export function safeJsonPreview(value: unknown, maxLen = 120): string {
  try {
    const s = JSON.stringify(value);
    if (s === undefined) {
      return "[undefined]";
    }
    if (s.length <= maxLen) {
      return s;
    }
    return s.slice(0, maxLen) + "\u2026";
  } catch {
    return "[unserializable]";
  }
}

function getStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}

function getNum(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

// ---------------------------------------------------------------------------
// Action extraction
// ---------------------------------------------------------------------------

/**
 * Get the effective applied action from an event.
 * Prefers `chosenAction` (from adjudication) over `action` (from submission).
 */
function getAppliedAction(event: Record<string, unknown>): Record<string, unknown> | null {
  return asObj(event.chosenAction) ?? asObj(event.action) ?? null;
}

/**
 * If the event has both a requested action (`action`) and an applied action
 * (`chosenAction`), return the requested action for debug display.
 */
function getRequestedAction(event: Record<string, unknown>): Record<string, unknown> | null {
  if ("chosenAction" in event && "action" in event) {
    return asObj(event.action);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scenario matching
// ---------------------------------------------------------------------------

function isHeist(scenario: string): boolean {
  return scenario.toLowerCase().includes("heist");
}

function isNumberGuess(scenario: string): boolean {
  const s = scenario.toLowerCase();
  return s.includes("number") || s.includes("guess");
}

function isResourceRivals(scenario: string): boolean {
  const s = scenario.toLowerCase();
  return s.includes("resource") || s.includes("rival");
}

// ---------------------------------------------------------------------------
// Scenario-specific action formatting
// ---------------------------------------------------------------------------

interface ActionInfo {
  text: string;
  isWait: boolean;
}

function formatHeistAction(a: Record<string, unknown>): ActionInfo {
  const t = getStr(a, "type");
  switch (t) {
    case "move":
      return {
        text: `Action: move (target=${getStr(a, "toRoomId") ?? getStr(a, "target") ?? "unknown"})`,
        isWait: false,
      };
    case "pickup":
      return {
        text: `Action: pickup (item=${getStr(a, "itemId") ?? getStr(a, "item") ?? "unknown"})`,
        isWait: false,
      };
    case "use_terminal":
      return {
        text: `Action: use_terminal (terminal=${getStr(a, "terminalId") ?? getStr(a, "target") ?? "unknown"})`,
        isWait: false,
      };
    case "interact":
      return {
        text: `Action: interact (target=${getStr(a, "target") ?? "unknown"}, using=${getStr(a, "item") ?? getStr(a, "itemId") ?? "none"})`,
        isWait: false,
      };
    case "use_item":
    case "use":
      return {
        text: `Action: use_item (item=${getStr(a, "itemId") ?? getStr(a, "item") ?? "unknown"}, target=${getStr(a, "target") ?? "room"})`,
        isWait: false,
      };
    case "extract":
      return { text: "Action: extract", isWait: false };
    case "wait":
      return { text: "Action: wait", isWait: true };
    default:
      if (t) {
        return { text: `Action: ${t}`, isWait: false };
      }
      return { text: `Action: ${safeJsonPreview(a, 80)}`, isWait: false };
  }
}

function formatNumberGuessAction(a: Record<string, unknown>): ActionInfo {
  const guess = getNum(a, "guess") ?? getNum(a, "value");
  if (guess !== undefined) {
    return { text: `Action: guess (value=${guess})`, isWait: false };
  }
  return { text: `Action: ${safeJsonPreview(a, 80)}`, isWait: false };
}

function formatResourceRivalsAction(a: Record<string, unknown>): ActionInfo {
  const amount = getNum(a, "bid") ?? getNum(a, "amount");
  if (amount !== undefined) {
    return { text: `Action: bid (amount=${amount})`, isWait: false };
  }
  return { text: `Action: ${safeJsonPreview(a, 80)}`, isWait: false };
}

function formatActionText(a: Record<string, unknown>, scenario: string): ActionInfo {
  if (isHeist(scenario)) {
    return formatHeistAction(a);
  }
  if (isNumberGuess(scenario)) {
    return formatNumberGuessAction(a);
  }
  if (isResourceRivals(scenario)) {
    return formatResourceRivalsAction(a);
  }

  // Generic
  const t = getStr(a, "type");
  if (t === "wait") {
    return { text: "Action: wait", isWait: true };
  }
  if (t) {
    return { text: `Action: ${t}`, isWait: false };
  }
  return { text: `Action: ${safeJsonPreview(a, 80)}`, isWait: false };
}

// ---------------------------------------------------------------------------
// State formatting
// ---------------------------------------------------------------------------

function formatStateUpdated(
  event: Record<string, unknown>,
  scenario: string,
): FormattedEvent {
  const summary = asObj(event.summary);
  if (!summary) {
    return { primaryText: "State updated", badge: "system" };
  }

  // NumberGuess: show per-agent feedback
  if (isNumberGuess(scenario)) {
    const agentFeedback = asObj(summary.agentFeedback);
    if (agentFeedback) {
      const parts: string[] = [];
      for (const [agentId, data] of Object.entries(agentFeedback)) {
        const d = asObj(data);
        if (d) {
          const lastGuess = getNum(d, "lastGuess");
          const fb = getStr(d, "feedback");
          if (lastGuess !== undefined && fb) {
            parts.push(`${agentId}: ${lastGuess} \u2192 ${fb}`);
          }
        }
      }
      if (parts.length > 0) {
        return { primaryText: `Result: ${parts.join(", ")}`, badge: "system" };
      }
    }
  }

  // Presence check: scores object in summary (common across scenarios)
  const scores = asObj(summary.scores);
  if (scores) {
    const entries = Object.entries(scores).filter(
      ([, v]) => typeof v === "number",
    );
    if (entries.length > 0) {
      const display = entries.map(([id, v]) => `${id}=${v}`).join(", ");
      return { primaryText: `Score: ${display}`, badge: "score" };
    }
  }

  // Heist: show alert level
  if (isHeist(scenario)) {
    const alertLevel = getNum(summary, "alertLevel");
    if (alertLevel !== undefined) {
      const turn = getNum(summary, "turn") ?? getNum(event, "turn");
      return {
        primaryText: `State: alert=${alertLevel}${turn !== undefined ? `, turn=${turn}` : ""}`,
        badge: "system",
      };
    }
  }

  // ResourceRivals: show objective progress
  if (isResourceRivals(scenario)) {
    const current = getNum(summary, "currentObjective");
    const total = getNum(summary, "totalObjectives");
    if (current !== undefined && total !== undefined) {
      return { primaryText: `Round ${current + 1} of ${total}`, badge: "system" };
    }
  }

  return {
    primaryText: "State updated",
    details: safeJsonPreview(summary, 120),
    badge: "system",
  };
}

// ---------------------------------------------------------------------------
// Feedback details (for valid ActionAdjudicated)
// ---------------------------------------------------------------------------

function formatFeedbackDetails(
  feedback: unknown,
  scenario: string,
): string | undefined {
  if (feedback === undefined || feedback === null) {
    return undefined;
  }

  const fb = asObj(feedback);
  if (!fb) {
    return typeof feedback === "string" ? feedback : undefined;
  }

  if (isNumberGuess(scenario)) {
    const result = getStr(fb, "feedback");
    if (result) {
      return `Result: ${result}`;
    }
  }

  if (isHeist(scenario)) {
    const msg = getStr(fb, "message");
    if (msg) {
      return msg;
    }
  }

  if (isResourceRivals(scenario)) {
    const error = getStr(fb, "error");
    if (error) {
      return `Error: ${error}`;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Main formatter
// ---------------------------------------------------------------------------

export function formatEvent(
  event: Record<string, unknown>,
  scenarioName: string,
): FormattedEvent {
  const type = getStr(event, "type");

  // -- InvalidAction (future event type) ------------------------------------
  if (type === "InvalidAction") {
    const reason = getStr(event, "reason") ?? "Unknown reason";
    const attempted = event.attemptedAction;
    return {
      primaryText: `REJECTED: ${reason}`,
      details:
        attempted !== undefined
          ? `Attempted: ${safeJsonPreview(attempted, 200)}`
          : undefined,
      badge: "invalid",
    };
  }

  // -- MatchStarted ---------------------------------------------------------
  if (type === "MatchStarted") {
    const scenario = getStr(event, "scenarioName") ?? scenarioName;
    const agentIds = Array.isArray(event.agentIds)
      ? (event.agentIds as unknown[])
          .filter((x): x is string => typeof x === "string")
          .join(" vs ")
      : "";
    return {
      primaryText: `Match started: ${scenario}${agentIds ? ` (${agentIds})` : ""}`,
      badge: "system",
    };
  }

  // -- MatchEnded -----------------------------------------------------------
  if (type === "MatchEnded") {
    const winnerField = getStr(event, "winner");
    let winner: string | null = winnerField ?? null;
    if (!winner) {
      const scores = asObj(event.scores);
      if (scores) {
        let maxScore = -Infinity;
        for (const [id, s] of Object.entries(scores)) {
          if (typeof s === "number" && s > maxScore) {
            maxScore = s;
            winner = id;
          }
        }
      }
    }
    const reason = getStr(event, "reason");
    return {
      primaryText: `Match ended. Winner: ${winner ?? "none"}`,
      details: reason ? `Reason: ${reason}` : undefined,
      badge: "end",
    };
  }

  // -- TurnStarted ----------------------------------------------------------
  if (type === "TurnStarted") {
    const turn = getNum(event, "turn");
    return {
      primaryText: `Turn ${turn ?? "?"} started`,
      badge: "system",
    };
  }

  // -- AgentError -----------------------------------------------------------
  if (type === "AgentError") {
    const message = getStr(event, "message") ?? "Unknown error";
    const agentId = getStr(event, "agentId");
    return {
      primaryText: `Error${agentId ? ` (${agentId})` : ""}: ${message}`,
      badge: "invalid",
    };
  }

  // -- ActionAdjudicated ----------------------------------------------------
  if (type === "ActionAdjudicated") {
    const valid = event.valid;
    if (valid === false) {
      // Invalid — show rejection reason from feedback
      const feedback = event.feedback;
      let reason = "Invalid action";
      const fb = asObj(feedback);
      if (fb) {
        reason =
          getStr(fb, "error") ??
          getStr(fb, "message") ??
          safeJsonPreview(feedback, 100);
      } else if (typeof feedback === "string") {
        reason = feedback;
      }
      const fallbackReason = getStr(event, "fallbackReason");
      const chosenAction = event.chosenAction;
      const parts: string[] = [];
      if (fallbackReason) {
        parts.push(`Fallback: ${fallbackReason}`);
      }
      if (chosenAction !== undefined) {
        parts.push(`Applied: ${safeJsonPreview(chosenAction, 120)}`);
      }
      return {
        primaryText: `REJECTED: ${reason}`,
        details: parts.length > 0 ? parts.join(" | ") : undefined,
        badge: "invalid",
      };
    }

    // Valid — format based on applied action
    const action = getAppliedAction(event);
    if (action) {
      const { text, isWait } = formatActionText(action, scenarioName);
      const requested = getRequestedAction(event);
      const feedbackDetail = formatFeedbackDetails(event.feedback, scenarioName);
      const detailParts: string[] = [];
      if (requested) {
        detailParts.push(`Requested: ${safeJsonPreview(requested, 120)}`);
      }
      if (feedbackDetail) {
        detailParts.push(feedbackDetail);
      }
      return {
        primaryText: text,
        details: detailParts.length > 0 ? detailParts.join(" | ") : undefined,
        badge: isWait ? "wait" : "action",
      };
    }
    return { primaryText: "Action adjudicated", badge: "action" };
  }

  // -- ActionSubmitted ------------------------------------------------------
  if (type === "ActionSubmitted") {
    const action = getAppliedAction(event);
    if (action) {
      const { text, isWait } = formatActionText(action, scenarioName);
      return { primaryText: text, badge: isWait ? "wait" : "action" };
    }
    return { primaryText: "Action submitted", badge: "action" };
  }

  // -- ObservationEmitted ---------------------------------------------------
  if (type === "ObservationEmitted") {
    const agentId = getStr(event, "agentId");
    return {
      primaryText: `Observation \u2192 ${agentId ?? "unknown"}`,
      badge: "system",
    };
  }

  // -- StateUpdated ---------------------------------------------------------
  if (type === "StateUpdated") {
    return formatStateUpdated(event, scenarioName);
  }

  // -- AgentRawOutput -------------------------------------------------------
  if (type === "AgentRawOutput") {
    const agentId = getStr(event, "agentId");
    const bytes = getNum(event, "rawBytes");
    return {
      primaryText: `Raw output \u2190 ${agentId ?? "unknown"}${bytes !== undefined ? ` (${bytes} bytes)` : ""}`,
      badge: "system",
    };
  }

  // -- Presence-based fallbacks for unknown event types ---------------------

  // Score-bearing events
  if ("scores" in event || "score" in event) {
    const scores = asObj(event.scores);
    if (scores) {
      const entries = Object.entries(scores).filter(
        ([, v]) => typeof v === "number",
      );
      if (entries.length > 0) {
        const display = entries.map(([id, v]) => `${id}=${v}`).join(", ");
        return {
          primaryText: `${type ?? "Score"}: ${display}`,
          badge: "score",
        };
      }
    }
    const score = getNum(event, "score");
    if (score !== undefined) {
      return {
        primaryText: `${type ?? "Score"}: ${score}`,
        badge: "score",
      };
    }
  }

  // Action-bearing events
  if ("action" in event || "chosenAction" in event) {
    const action = getAppliedAction(event);
    if (action) {
      const { text, isWait } = formatActionText(action, scenarioName);
      const requested = getRequestedAction(event);
      return {
        primaryText: text,
        details: requested
          ? `Requested: ${safeJsonPreview(requested, 120)}`
          : undefined,
        badge: isWait ? "wait" : "action",
      };
    }
  }

  // -- Catch-all fallback ---------------------------------------------------
  return {
    primaryText: `${type ?? "Unknown"}: ${safeJsonPreview(event, 120)}`,
    badge: "system",
  };
}
