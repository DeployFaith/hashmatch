import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas matching the engine contract (src/contract/types.ts)
// ---------------------------------------------------------------------------

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const BaseFields = {
  seq: z.number().int(),
  matchId: z.string(),
};

export const MatchStartedSchema = z
  .object({
    ...BaseFields,
    type: z.literal("MatchStarted"),
    seed: z.number(),
    agentIds: z.array(z.string()),
    scenarioName: z.string(),
    maxTurns: z.number().int(),
    // Optional provenance fields
    engineCommit: z.string().optional(),
    engineVersion: z.string().optional(),
  })
  .passthrough();

export const TurnStartedSchema = z
  .object({
    ...BaseFields,
    type: z.literal("TurnStarted"),
    turn: z.number().int(),
  })
  .passthrough();

export const ObservationEmittedSchema = z
  .object({
    ...BaseFields,
    type: z.literal("ObservationEmitted"),
    agentId: z.string(),
    turn: z.number().int(),
    observation: JsonValueSchema,
  })
  .passthrough();

export const ActionSubmittedSchema = z
  .object({
    ...BaseFields,
    type: z.literal("ActionSubmitted"),
    agentId: z.string(),
    turn: z.number().int(),
    action: JsonValueSchema,
  })
  .passthrough();

export const ActionAdjudicatedSchema = z
  .object({
    ...BaseFields,
    type: z.literal("ActionAdjudicated"),
    agentId: z.string(),
    turn: z.number().int(),
    valid: z.boolean(),
    feedback: JsonValueSchema,
  })
  .passthrough();

export const StateUpdatedSchema = z
  .object({
    ...BaseFields,
    type: z.literal("StateUpdated"),
    turn: z.number().int(),
    summary: JsonValueSchema,
  })
  .passthrough();

export const AgentErrorSchema = z
  .object({
    ...BaseFields,
    type: z.literal("AgentError"),
    agentId: z.string(),
    turn: z.number().int(),
    message: z.string(),
  })
  .passthrough();

export const MatchEndedSchema = z
  .object({
    ...BaseFields,
    type: z.literal("MatchEnded"),
    reason: z.enum(["completed", "maxTurnsReached", "error"]),
    scores: z.record(z.string(), z.number()),
    turns: z.number().int(),
    details: JsonValueSchema.optional(),
  })
  .passthrough();

export const MatchEventSchema = z.union([
  MatchStartedSchema,
  TurnStartedSchema,
  ObservationEmittedSchema,
  ActionSubmittedSchema,
  ActionAdjudicatedSchema,
  StateUpdatedSchema,
  AgentErrorSchema,
  MatchEndedSchema,
]);

export type ParsedMatchEvent = z.infer<typeof MatchEventSchema>;

// ---------------------------------------------------------------------------
// JSONL parser with Zod validation
// ---------------------------------------------------------------------------

export interface ParseResult {
  events: ParsedMatchEvent[];
  errors: ParseError[];
}

export interface ParseError {
  line: number;
  message: string;
}

/** Parse a JSONL string, validating each line with Zod. */
export function parseReplayJsonl(text: string): ParseResult {
  const lines = text.split("\n");
  const events: ParsedMatchEvent[] = [];
  const errors: ParseError[] = [];
  let expectedSeq: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      errors.push({ line: i + 1, message: "Invalid JSON" });
      continue;
    }

    const result = MatchEventSchema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      errors.push({
        line: i + 1,
        message: issue ? `${issue.path.join(".")}: ${issue.message}` : "Validation failed",
      });
      continue;
    }

    const event = result.data;

    // Check sequential ordering
    if (expectedSeq === null) {
      expectedSeq = event.seq;
    }
    if (event.seq !== expectedSeq) {
      errors.push({
        line: i + 1,
        message: `Expected seq ${expectedSeq}, got ${event.seq}`,
      });
    }
    expectedSeq = event.seq + 1;

    events.push(event);
  }

  return { events, errors };
}
