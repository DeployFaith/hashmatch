import type { Agent, AgentConfig, AgentContext } from "../contract/interfaces.js";
import type { AgentId } from "../contract/types.js";

// TODO(llm-policy-alignment): Scripted no-op agent — no LLM call.
// This is a degenerate-by-design agent used for smoke tests and as an
// FM-classifier baseline (expected to trigger FM-10 wait-spam, etc.).
// Decision: (C) keep deterministic, explicitly label as a classifier baseline.
// Used in: agent-compat.test.ts, tournament registry (key: "noop"),
// heist fixture README generation script.
/**
 * No-op agent that always returns an empty action object.
 * Useful for smoke-testing scenarios without scenario-specific logic.
 */
export function createNoopAgent(id: AgentId): Agent<unknown, Record<string, never>> {
  return {
    id,
    init(_config: AgentConfig): void {
      // Stateless — nothing to initialize.
    },
    act(_observation: unknown, _ctx: AgentContext): Record<string, never> {
      return {};
    },
  };
}
