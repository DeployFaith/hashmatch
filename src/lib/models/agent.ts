import { z } from "zod";

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  description: z.string(),
  tags: z.array(z.string()),
  rating: z.number(),
  reliability: z.number().min(0).max(1),
  lastSeen: z.string(),
  capabilities: z.array(z.string()),
});

export type Agent = z.infer<typeof AgentSchema>;
