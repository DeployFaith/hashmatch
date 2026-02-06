import { z } from "zod";

export const RunStatusEnum = z.enum(["pending", "running", "completed", "failed", "timeout"]);

export type RunStatus = z.infer<typeof RunStatusEnum>;

export const RunSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  agentId: z.string(),
  status: RunStatusEnum,
  startedAt: z.string(),
  endedAt: z.string().optional(),
  metrics: z.object({
    actions: z.number(),
    errors: z.number(),
    avgResponseMs: z.number(),
    score: z.number().optional(),
  }),
  logs: z.array(z.string()),
});

export type Run = z.infer<typeof RunSchema>;
