import { z } from "zod";

export const MatchStatusEnum = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "error",
]);

export type MatchStatus = z.infer<typeof MatchStatusEnum>;

export const EpisodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  startedAt: z.string(),
  eventIds: z.array(z.string()),
});

export type Episode = z.infer<typeof EpisodeSchema>;

export const MatchSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: MatchStatusEnum,
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  agents: z.array(z.string()),
  rulesetId: z.string(),
  episodes: z.array(EpisodeSchema),
  score: z.record(z.string(), z.number()).optional(),
});

export type Match = z.infer<typeof MatchSchema>;
