import { z } from "zod";

export const FlowStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isInitial: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
});

export type FlowState = z.infer<typeof FlowStateSchema>;

export const TriggerSchema = z.object({
  id: z.string(),
  name: z.string(),
  condition: z.string(),
  action: z.string(),
});

export type Trigger = z.infer<typeof TriggerSchema>;

export const InvariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  expression: z.string(),
  severity: z.enum(["warning", "error", "critical"]),
  description: z.string(),
});

export type Invariant = z.infer<typeof InvariantSchema>;

export const TransitionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  trigger: z.string(),
  guard: z.string().optional(),
});

export type Transition = z.infer<typeof TransitionSchema>;

export const FlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  states: z.array(FlowStateSchema),
  triggers: z.array(TriggerSchema),
  invariants: z.array(InvariantSchema),
  transitions: z.array(TransitionSchema),
});

export type Flow = z.infer<typeof FlowSchema>;
