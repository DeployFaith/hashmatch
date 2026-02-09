import type { ScenarioHints } from "../../contract/interfaces.js";
import type { MatchEvent } from "../../contract/types.js";
import type { FailureModeProfile } from "../fm/types.js";
import { classifyFailureModes } from "../fm/classify.js";

export function computeFailureModes(args: {
  events: MatchEvent[];
  scenarioHints: ScenarioHints;
  agentIds: string[];
  maxTurns?: number;
}): FailureModeProfile {
  return classifyFailureModes(args);
}
