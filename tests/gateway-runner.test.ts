import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBaselineAgent } from "../src/agents/baselineAgent.js";
import { createRandomAgent } from "../src/agents/randomAgent.js";
import { toStableJsonl } from "../src/core/json.js";
import { runMatch } from "../src/engine/runMatch.js";
import { runMatchWithGateway } from "../src/engine/runMatchWithGateway.js";
import type { GatewayRuntimeConfig } from "../src/gateway/runtime.js";
import { createTranscriptWriter, GATEWAY_TRANSCRIPT_FILENAME } from "../src/gateway/transcript.js";
import { createNumberGuessScenario } from "../src/scenarios/numberGuess/index.js";

function makeAgents() {
  return [createRandomAgent("random-1"), createBaselineAgent("baseline-1")];
}

describe("Gateway runner integration", () => {
  it("produces identical match.jsonl for local gateway and writes transcript", async () => {
    const seed = 42;
    const turns = 5;

    const baseline = await runMatch(createNumberGuessScenario(), makeAgents(), {
      seed,
      maxTurns: turns,
    });

    const tempDir = mkdtempSync(join(tmpdir(), "gateway-runner-"));
    try {
      const gatewayConfig: GatewayRuntimeConfig = {
        mode: "local",
        config: { defaultDeadlineMs: 1000, maxResponseBytes: 1024 * 1024 },
        transcriptWriter: createTranscriptWriter(tempDir),
      };

      const gatewayResult = await runMatchWithGateway(
        createNumberGuessScenario(),
        makeAgents(),
        { seed, maxTurns: turns },
        gatewayConfig,
      );

      expect(toStableJsonl(gatewayResult.events)).toBe(toStableJsonl(baseline.events));
      const transcriptPath = join(tempDir, GATEWAY_TRANSCRIPT_FILENAME);
      expect(existsSync(transcriptPath)).toBe(true);
      const transcript = readFileSync(transcriptPath, "utf-8").trim();
      expect(transcript.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not create transcript without gateway", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gateway-runner-no-"));
    try {
      await runMatch(createNumberGuessScenario(), makeAgents(), { seed: 7, maxTurns: 3 });
      expect(existsSync(join(tempDir, GATEWAY_TRANSCRIPT_FILENAME))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
