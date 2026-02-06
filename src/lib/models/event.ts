import { z } from "zod";

export const EventTypeEnum = z.enum([
  "match_started",
  "match_ended",
  "turn_started",
  "action_submitted",
  "action_adjudicated",
  "state_updated",
  "agent_error",
  "observation_emitted",
  "rule_triggered",
  "invariant_checked",
]);

export type EventType = z.infer<typeof EventTypeEnum>;

export const SeverityEnum = z.enum(["info", "warning", "error", "critical", "success"]);

export type Severity = z.infer<typeof SeverityEnum>;

export const InvariantCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["pass", "fail", "unknown"]),
  message: z.string().optional(),
});

export type InvariantCheck = z.infer<typeof InvariantCheckSchema>;

export const EventSchema = z.object({
  id: z.string(),
  ts: z.string(),
  type: EventTypeEnum,
  severity: SeverityEnum,
  summary: z.string(),
  details: z.string().optional(),
  relatedAgentId: z.string().optional(),
  relatedRunId: z.string().optional(),
  invariantChecks: z.array(InvariantCheckSchema).optional(),
});

export type Event = z.infer<typeof EventSchema>;
