/**
 * Tolerant JSONL parser for replay files.
 *
 * Unlike the strict Zod-validated parser in `parser.ts`, this parser:
 * - Keeps unknown fields on every event (passthrough)
 * - Normalises common fields: type, seq, matchId, turn, agentId
 * - Continues on error, collecting parse errors with line numbers
 * - Sorts events strictly by `seq` ASC with stable tie-break by original index
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplayEvent {
  /** Engine event type (e.g. "MatchStarted") */
  type: string;
  /** Sequence number assigned by the engine */
  seq: number;
  /** Match identifier */
  matchId: string;
  /** Turn number (if present) */
  turn?: number;
  /** Agent identifier (if present) */
  agentId?: string;
  /** The full original parsed object, including unknown fields */
  raw: Record<string, unknown>;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseJsonlResult {
  events: ReplayEvent[];
  errors: ParseError[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Parse a JSONL string tolerantly, normalising common fields. */
export function parseJsonl(text: string): ParseJsonlResult {
  const lines = text.split("\n");
  const events: (ReplayEvent & { _origIdx: number })[] = [];
  const errors: ParseError[] = [];

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

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      errors.push({ line: i + 1, message: "Expected a JSON object" });
      continue;
    }

    const obj = raw as Record<string, unknown>;

    // type is required
    if (typeof obj.type !== "string") {
      errors.push({ line: i + 1, message: "Missing or invalid 'type' field" });
      continue;
    }

    // seq is required (must be number)
    if (typeof obj.seq !== "number") {
      errors.push({ line: i + 1, message: "Missing or invalid 'seq' field" });
      continue;
    }

    // matchId is required
    if (typeof obj.matchId !== "string") {
      errors.push({ line: i + 1, message: "Missing or invalid 'matchId' field" });
      continue;
    }

    const event: ReplayEvent & { _origIdx: number } = {
      type: obj.type,
      seq: obj.seq,
      matchId: obj.matchId,
      turn: typeof obj.turn === "number" ? obj.turn : undefined,
      agentId: typeof obj.agentId === "string" ? obj.agentId : undefined,
      raw: obj,
      _origIdx: events.length,
    };

    events.push(event);
  }

  // Stable sort by seq ascending, tie-break by original index
  events.sort((a, b) => a.seq - b.seq || a._origIdx - b._origIdx);

  // Strip internal index
  const cleaned: ReplayEvent[] = events.map(({ _origIdx: _, ...rest }) => rest);

  return { events: cleaned, errors };
}
