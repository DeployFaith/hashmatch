import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/core/json.js";
import {
  createTranscriptWriter,
  GATEWAY_TRANSCRIPT_FILENAME,
} from "../src/gateway/transcript.js";
import type { GatewayTranscriptEntry } from "../src/gateway/types.js";

describe("TranscriptWriter", () => {
  it("writes stable JSONL with trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "gateway-transcript-"));
    try {
      const writer = createTranscriptWriter(dir);
      const entries: GatewayTranscriptEntry[] = [
        {
          matchId: "match-1",
          turn: 1,
          agentId: "agent-1",
          timestamp: "2024-01-01T00:00:00.000Z",
          observationSentAt: "2024-01-01T00:00:00.000Z",
          observationBytes: 10,
          actionReceivedAt: "2024-01-01T00:00:01.000Z",
          actionBytes: 5,
          responseTimeMs: 1000,
          status: "ok",
          fallbackApplied: false,
        },
        {
          matchId: "match-1",
          turn: 2,
          agentId: "agent-1",
          timestamp: "2024-01-01T00:00:02.000Z",
          observationSentAt: "2024-01-01T00:00:02.000Z",
          observationBytes: 12,
          responseTimeMs: 500,
          status: "timeout",
          errorMessage: "Timed out",
          fallbackApplied: true,
          fallbackAction: { noop: true },
        },
      ];

      for (const entry of entries) {
        writer.write(entry);
      }

      const raw = readFileSync(join(dir, GATEWAY_TRANSCRIPT_FILENAME), "utf-8");
      const expected = entries.map((entry) => stableStringify(entry)).join("\n") + "\n";
      expect(raw).toBe(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
