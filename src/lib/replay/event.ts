import { z } from "zod";

export const CanonicalEventSchema = z
  .object({
    type: z.string(),
    seq: z.number().int().optional(),
    matchId: z.string().optional(),
    turn: z.number().int().optional(),
    agentId: z.string().optional(),
    payload: z.unknown().optional(),
    details: z.unknown().optional(),
    lineNo: z.number().int().optional(),
  })
  .strict();

export const CanonicalUnknownEventSchema = z
  .object({
    type: z.literal("unknown"),
    seq: z.number().int().optional(),
    matchId: z.string().optional(),
    turn: z.number().int().optional(),
    agentId: z.string().optional(),
    raw: z.unknown(),
    lineNo: z.number().int(),
  })
  .strict();

export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;
export type CanonicalUnknownEvent = z.infer<typeof CanonicalUnknownEventSchema>;

export type EventSortKey = [number, number, string, string, number];

export function normalizeJsonlLine(
  input: unknown,
  lineNo: number,
): CanonicalEvent | CanonicalUnknownEvent {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      type: "unknown",
      raw: input,
      lineNo,
    };
  }

  const obj = input as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : undefined;
  const seq = typeof obj.seq === "number" ? obj.seq : undefined;
  const matchId = typeof obj.matchId === "string" ? obj.matchId : undefined;
  const turn = typeof obj.turn === "number" ? obj.turn : undefined;
  const agentId = typeof obj.agentId === "string" ? obj.agentId : undefined;
  const payload = "payload" in obj ? obj.payload : undefined;
  const details = "details" in obj ? obj.details : undefined;

  if (!type) {
    return {
      type: "unknown",
      seq,
      matchId,
      turn,
      agentId,
      raw: obj,
      lineNo,
    };
  }

  return {
    type,
    seq,
    matchId,
    turn,
    agentId,
    payload,
    details,
    lineNo,
  };
}

export function eventSortKey(event: CanonicalEvent | CanonicalUnknownEvent): EventSortKey {
  if (typeof event.seq === "number") {
    return [0, event.seq, "", "", event.lineNo ?? 0];
  }

  return [
    1,
    typeof event.turn === "number" ? event.turn : Number.MAX_SAFE_INTEGER,
    typeof event.agentId === "string" ? event.agentId : "",
    event.type,
    event.lineNo ?? 0,
  ];
}
