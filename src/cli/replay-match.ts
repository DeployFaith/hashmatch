import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type {
  MatchEvent,
  MatchStartedEvent,
  MatchEndedEvent,
  ActionSubmittedEvent,
  ActionAdjudicatedEvent,
  AgentErrorEvent,
  StateUpdatedEvent,
} from "../contract/types.js";

// ---------------------------------------------------------------------------
// Known event types (must match MatchEvent union)
// ---------------------------------------------------------------------------

const KNOWN_TYPES = new Set([
  "MatchStarted",
  "TurnStarted",
  "ObservationEmitted",
  "ActionSubmitted",
  "ActionAdjudicated",
  "StateUpdated",
  "AgentError",
  "MatchEnded",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stringify a value safely and truncate to `max` characters. */
export function truncateJson(v: unknown, max = 140): string {
  let s: string;
  try {
    s = JSON.stringify(v);
  } catch {
    s = String(v);
  }
  if (s.length <= max) {
    return s;
  }
  return s.slice(0, max - 3) + "...";
}

// ---------------------------------------------------------------------------
// JSONL parser with validation
// ---------------------------------------------------------------------------

/** Parse a JSONL string into a validated MatchEvent[]. Throws on errors. */
export function parseMatchEventsJsonl(text: string): MatchEvent[] {
  const lines = text.split("\n");
  const events: MatchEvent[] = [];
  let expectedSeq: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Line ${i + 1}: invalid JSON`);
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Line ${i + 1}: expected a JSON object`);
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj["type"] !== "string") {
      throw new Error(`Line ${i + 1}: missing or non-string "type"`);
    }
    if (typeof obj["seq"] !== "number") {
      throw new Error(`Line ${i + 1}: missing or non-number "seq"`);
    }
    if (typeof obj["matchId"] !== "string") {
      throw new Error(`Line ${i + 1}: missing or non-string "matchId"`);
    }

    if (!KNOWN_TYPES.has(obj["type"] as string)) {
      throw new Error(`Line ${i + 1}: unknown event type "${obj["type"]}"`);
    }

    const seq = obj["seq"] as number;
    if (expectedSeq === null) {
      expectedSeq = seq;
    }
    if (seq !== expectedSeq) {
      throw new Error(`Line ${i + 1}: expected seq ${expectedSeq}, got ${seq}`);
    }
    expectedSeq = seq + 1;

    events.push(obj as unknown as MatchEvent);
  }

  return events;
}

// ---------------------------------------------------------------------------
// Console recap renderer
// ---------------------------------------------------------------------------

/** Render a human-readable console recap from a validated event list. */
export function renderConsoleRecap(events: MatchEvent[]): string {
  const lines: string[] = [];

  // Find MatchStarted and MatchEnded
  const started = events.find((e) => e.type === "MatchStarted") as MatchStartedEvent | undefined;
  const ended = events.find((e) => e.type === "MatchEnded") as MatchEndedEvent | undefined;

  // Header
  lines.push("=== MATCH RECAP ===");
  if (started) {
    lines.push(`Match:    ${started.matchId}`);
    lines.push(`Scenario: ${started.scenarioName}`);
    lines.push(`Seed:     ${started.seed}`);
    lines.push(`Agents:   ${started.agentIds.join(", ")}`);
    lines.push(`MaxTurns: ${started.maxTurns}`);
  }
  lines.push("");

  // Group events by turn
  let currentTurn = 0;
  for (const event of events) {
    if (event.type === "MatchStarted" || event.type === "MatchEnded") {
      continue;
    }

    if (event.type === "TurnStarted") {
      currentTurn = event.turn;
      lines.push(`--- Turn ${currentTurn} ---`);
      continue;
    }

    if (event.type === "ActionSubmitted") {
      const e = event as ActionSubmittedEvent;
      lines.push(`  [${e.agentId}] action: ${truncateJson(e.action)}`);
    }

    if (event.type === "ActionAdjudicated") {
      const e = event as ActionAdjudicatedEvent;
      const mark = e.valid ? "ok" : "INVALID";
      lines.push(`  [${e.agentId}] result: ${mark} — ${truncateJson(e.feedback)}`);
    }

    if (event.type === "AgentError") {
      const e = event as AgentErrorEvent;
      lines.push(`  [${e.agentId}] ERROR: ${e.message}`);
    }

    if (event.type === "StateUpdated") {
      const e = event as StateUpdatedEvent;
      lines.push(`  state: ${truncateJson(e.summary, 100)}`);
    }

    if (event.type === "ObservationEmitted") {
      // Observations are verbose; show a very short truncation
      lines.push(`  [${event.agentId}] obs: ${truncateJson(event.observation, 60)}`);
    }
  }

  // Footer
  lines.push("");
  lines.push("=== RESULT ===");
  if (ended) {
    lines.push(`Reason: ${ended.reason}`);
    lines.push(`Turns:  ${ended.turns}`);
    lines.push(`Scores: ${truncateJson(ended.scores)}`);
    if (ended.details !== undefined) {
      lines.push(`Details: ${truncateJson(ended.details)}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Markdown recap renderer
// ---------------------------------------------------------------------------

/** Render a Markdown recap from a validated event list. */
export function renderMarkdownRecap(events: MatchEvent[]): string {
  const lines: string[] = [];

  const started = events.find((e) => e.type === "MatchStarted") as MatchStartedEvent | undefined;
  const ended = events.find((e) => e.type === "MatchEnded") as MatchEndedEvent | undefined;

  // Header
  lines.push("# Match Recap");
  lines.push("");
  if (started) {
    lines.push(`| Field | Value |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Match ID | \`${started.matchId}\` |`);
    lines.push(`| Scenario | ${started.scenarioName} |`);
    lines.push(`| Seed | ${started.seed} |`);
    lines.push(`| Agents | ${started.agentIds.map((a) => `\`${a}\``).join(", ")} |`);
    lines.push(`| Max Turns | ${started.maxTurns} |`);
    lines.push("");
  }

  // Turns
  lines.push("## Turns");
  lines.push("");

  for (const event of events) {
    if (event.type === "TurnStarted") {
      lines.push(`### Turn ${event.turn}`);
      lines.push("");
      continue;
    }

    if (event.type === "ActionSubmitted") {
      const e = event as ActionSubmittedEvent;
      lines.push(`- **${e.agentId}** action: \`${truncateJson(e.action)}\``);
    }

    if (event.type === "ActionAdjudicated") {
      const e = event as ActionAdjudicatedEvent;
      const mark = e.valid ? "valid" : "**INVALID**";
      lines.push(`  - Result: ${mark} — \`${truncateJson(e.feedback)}\``);
    }

    if (event.type === "AgentError") {
      const e = event as AgentErrorEvent;
      lines.push(`- **${e.agentId}** ERROR: ${e.message}`);
    }

    if (event.type === "StateUpdated") {
      const e = event as StateUpdatedEvent;
      lines.push(`- State: \`${truncateJson(e.summary, 100)}\``);
      lines.push("");
    }
  }

  // Result
  lines.push("## Result");
  lines.push("");
  if (ended) {
    lines.push(`| Field | Value |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Reason | ${ended.reason} |`);
    lines.push(`| Turns | ${ended.turns} |`);
    lines.push(`| Scores | \`${truncateJson(ended.scores)}\` |`);
    if (ended.details !== undefined) {
      lines.push(`| Details | \`${truncateJson(ended.details)}\` |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface ReplayCliArgs {
  inFile: string | undefined;
  outMd: string | undefined;
}

function parseReplayArgs(argv: string[]): ReplayCliArgs {
  let inFile: string | undefined;
  let outMd: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--in" && i + 1 < argv.length) {
      inFile = argv[++i];
    } else if (arg === "--out-md" && i + 1 < argv.length) {
      outMd = argv[++i];
    } else if (!arg.startsWith("--") && inFile === undefined) {
      // Positional: treat as input file
      inFile = arg;
    }
  }

  return { inFile, outMd };
}

function main(): void {
  const args = parseReplayArgs(process.argv.slice(2));

  if (!args.inFile) {
    // eslint-disable-next-line no-console
    console.error("Usage: replay-match --in <events.jsonl> [--out-md <recap.md>]");
    // eslint-disable-next-line no-console
    console.error("       replay-match <events.jsonl>");
    process.exit(1);
  }

  const text = readFileSync(args.inFile, "utf-8");
  const events = parseMatchEventsJsonl(text);

  // Console recap to stdout
  const recap = renderConsoleRecap(events);
  process.stdout.write(recap);

  // Optional Markdown output
  if (args.outMd) {
    const md = renderMarkdownRecap(events);
    writeFileSync(args.outMd, md, "utf-8");
    // eslint-disable-next-line no-console
    console.error(`Wrote Markdown recap to ${args.outMd}`);
  }
}

// Only run when executed directly (not when imported by tests)
const self = fileURLToPath(import.meta.url);
const entry = resolve(process.argv[1] ?? "");
if (self === entry) {
  main();
}
