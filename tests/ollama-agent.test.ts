import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as ollamaClient from "../src/agents/ollama/ollamaClient.js";
import * as llmClient from "../src/agents/llm/client.js";
import { createOllamaAgent } from "../src/agents/ollama/createOllamaAgent.js";
import { createOllamaHeistAgent } from "../src/agents/ollama/index.js";
import { heistAdapter, parseResponse } from "../src/agents/ollama/heistAdapter.js";
import { runMatch } from "../src/engine/runMatch.js";
import { createHeistScenario } from "../src/scenarios/heist/index.js";
import { toStableJsonl } from "../src/core/json.js";
import { parseReplayJsonl } from "../src/lib/replay/parser.js";
import type { OllamaChatMessage, OllamaConfig } from "../src/agents/ollama/ollamaClient.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ollamaChat", () => {
  it("sends requests without options when none are provided", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const config: OllamaConfig = { model: "test-model" };
    const messages: OllamaChatMessage[] = [{ role: "user", content: "hi" }];
    const result = await ollamaClient.ollamaChat(config, messages);

    expect(result).toBe("ok");
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>;
    const call = calls[0];
    if (!call) {
      throw new Error("Expected fetch to be called");
    }
    const request = call[1];
    if (!request?.body) {
      throw new Error("Expected request body to be set");
    }
    const body = JSON.parse(request.body as string) as Record<string, unknown>;
    expect(body.options).toBeUndefined();
  });

  it("includes options when provided", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const config: OllamaConfig = { model: "test-model", options: { temperature: 0.5 } };
    await ollamaClient.ollamaChat(config, []);

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>;
    const call = calls[0];
    if (!call) {
      throw new Error("Expected fetch to be called");
    }
    const request = call[1];
    if (!request?.body) {
      throw new Error("Expected request body to be set");
    }
    const body = JSON.parse(request.body as string) as Record<string, unknown>;
    expect(body.options).toBeUndefined();
    expect(body.temperature).toBe(0.5);
  });

  it("returns status errors for non-200 responses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ollamaClient.ollamaChat({ model: "test-model" }, []);
    expect(result).toBe("ERROR: Ollama returned status 500");
  });

  it("returns unreachable error on network failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ollamaClient.ollamaChat({ model: "test-model" }, []);
    expect(result).toBe("ERROR: Ollama unreachable");
  });

  it("returns unreachable error on timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      () =>
        new Promise(() => {
          // never resolves
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = ollamaClient.ollamaChat({ model: "test-model", timeoutMs: 10 }, []);
    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toBe("ERROR: Ollama unreachable");
  });
});

describe("heistAdapter.parseResponse", () => {
  it("parses valid JSON", () => {
    const parsed = parseResponse('{"type":"wait"}');
    expect(parsed).toEqual({ type: "wait" });
  });

  it("parses JSON inside markdown fences", () => {
    const parsed = parseResponse('```json\n{"type":"extract"}\n```');
    expect(parsed).toEqual({ type: "extract" });
  });

  it("parses JSON inside prose", () => {
    const parsed = parseResponse('Here you go: {"type":"move","toRoomId":"room-2"}');
    expect(parsed).toEqual({ type: "move", toRoomId: "room-2" });
  });

  it("returns null for garbage input", () => {
    const parsed = parseResponse("no json here");
    expect(parsed).toEqual({ type: "wait" });
  });

  it("uses a legal fallback action", () => {
    expect(heistAdapter.fallbackAction).toEqual({ type: "wait" });
  });

  it("parses bare valid JSON with pickup action", () => {
    const parsed = parseResponse('{"type":"pickup","itemId":"keycard-1"}');
    expect(parsed).toEqual({ type: "pickup", itemId: "keycard-1" });
  });

  it("parses JSON with surrounding whitespace and newlines", () => {
    const parsed = parseResponse('  \n{"type":"move","toRoomId":"room-2"}\n  ');
    expect(parsed).toEqual({ type: "move", toRoomId: "room-2" });
  });

  it("parses markdown-fenced JSON with pickup action", () => {
    const parsed = parseResponse('```json\n{"type":"pickup","itemId":"keycard-1"}\n```');
    expect(parsed).toEqual({ type: "pickup", itemId: "keycard-1" });
  });

  it("parses prose-wrapped JSON with move action", () => {
    const parsed = parseResponse(
      'Sure! Here is my action: {"type":"move","toRoomId":"room-2"} I chose to move.',
    );
    expect(parsed).toEqual({ type: "move", toRoomId: "room-2" });
  });

  it("unwraps action key wrapper", () => {
    const parsed = parseResponse('{"action":{"type":"pickup","itemId":"keycard-1"}}');
    expect(parsed).toEqual({ type: "pickup", itemId: "keycard-1" });
  });

  it("returns null for garbage text with no JSON", () => {
    const parsed = parseResponse("I am confused about what to do");
    expect(parsed).toEqual({ type: "wait" });
  });

  it("returns null for empty string", () => {
    const parsed = parseResponse("");
    expect(parsed).toEqual({ type: "wait" });
  });

  it("returns null for invalid action type inside valid JSON", () => {
    const parsed = parseResponse('{"type":"fly","destination":"moon"}');
    expect(parsed).toEqual({ type: "wait" });
  });

  it("unwraps response key wrapper", () => {
    const parsed = parseResponse('{"response":{"type":"extract"}}');
    expect(parsed).toEqual({ type: "extract" });
  });

  it("unwraps result key wrapper", () => {
    const parsed = parseResponse('{"result":{"type":"wait"}}');
    expect(parsed).toEqual({ type: "wait" });
  });

  it("parses nested JSON from prose using brace matching", () => {
    const parsed = parseResponse(
      'I will move now: {"action":{"type":"move","toRoomId":"room-3"}} end.',
    );
    expect(parsed).toEqual({ type: "move", toRoomId: "room-3" });
  });

  it("parses plain fences without json tag", () => {
    const parsed = parseResponse('```\n{"type":"use_terminal","terminalId":"term-1"}\n```');
    expect(parsed).toEqual({ type: "use_terminal", terminalId: "term-1" });
  });
});

describe("heistAdapter decoder forensics", () => {
  it("logs raw outputs and adjudication details for malformed turns", async () => {
    const responses = [
      '{"type":"move","toRoomId":"room-2"}',
      '```json\n{"type":"pickup","itemId":"keycard-1"}\n```',
      "garbage response",
      "",
    ];

    vi.spyOn(llmClient, "generateStructured").mockImplementation(async () => {
      throw new Error("force text fallback");
    });
    vi.spyOn(llmClient, "generatePlainText").mockImplementation(async () => ({
      text: responses.shift() ?? "",
      usage: {
        inputTokens: 0,
        inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokens: 0,
        outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
        totalTokens: 0,
      },
      finishReason: "stop",
      responseBody: { mock: true },
    }));

    const scenario = createHeistScenario();
    const agents = [createOllamaHeistAgent("ollama-a"), createOllamaHeistAgent("ollama-b")];
    const result = await runMatch(scenario, agents, { seed: 33, maxTurns: 2 });

    const rawOutputEvents = result.events.filter((event) => event.type === "AgentRawOutput");
    expect(rawOutputEvents).toHaveLength(4);
    for (const event of rawOutputEvents) {
      expect(typeof event.rawSha256).toBe("string");
      expect(event.rawBytes).toBeGreaterThanOrEqual(0);
      expect(typeof event.truncated).toBe("boolean");
      expect(typeof event._privateRaw).toBe("string");
    }

    const adjudicated = result.events.filter((event) => event.type === "ActionAdjudicated");
    expect(adjudicated).toHaveLength(4);
    for (const event of adjudicated) {
      expect(event.method).toBeTruthy();
      expect(event.chosenAction).toBeTruthy();
      expect(event.fallbackReason === null || typeof event.fallbackReason === "string").toBe(true);
    }

    const waitActions = adjudicated.filter(
      (event) => (event.chosenAction as { type?: string }).type === "wait",
    );
    expect(waitActions.length).toBeGreaterThan(0);
    for (const event of waitActions) {
      expect(event.fallbackReason).not.toBeNull();
    }

    const jsonl = toStableJsonl(result.events);
    const replay = parseReplayJsonl(jsonl);
    expect(replay.errors).toEqual([]);
  });
});

describe("createOllamaAgent", () => {
  it("runs the full pipeline and returns parsed actions", async () => {
    const textSpy = vi.spyOn(llmClient, "generatePlainText").mockResolvedValue({
      text: '{"type":"wait"}',
      usage: {
        inputTokens: 0,
        inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokens: 0,
        outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
        totalTokens: 0,
      },
      finishReason: "stop",
      responseBody: { mock: true },
    });

    const adapter = {
      systemPrompt: "system",
      formatObservation: vi.fn(() => "formatted obs"),
      parseResponse: vi.fn(() => ({ type: "wait" })),
      fallbackAction: { type: "wait" },
    };

    const agent = createOllamaAgent("ollama-1", { model: "test" }, adapter);
    agent.init({ agentId: "ollama-1", seed: 1 });
    const action = await agent.act({ turn: 1 }, { agentId: "ollama-1", turn: 1, rng: () => 0.5 });

    expect(adapter.formatObservation).toHaveBeenCalled();
    expect(textSpy).toHaveBeenCalled();
    expect(adapter.parseResponse).toHaveBeenCalled();
    expect(action).toEqual({ type: "wait" });
  });

  it("falls back when response parsing fails", async () => {
    vi.spyOn(llmClient, "generatePlainText").mockResolvedValue({
      text: "garbage",
      usage: {
        inputTokens: 0,
        inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokens: 0,
        outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
        totalTokens: 0,
      },
      finishReason: "stop",
      responseBody: { mock: true },
    });

    const adapter = {
      systemPrompt: "system",
      formatObservation: vi.fn(() => "formatted obs"),
      parseResponse: vi.fn(() => ({ type: "wait" })),
      fallbackAction: { type: "wait" },
    };

    const agent = createOllamaAgent("ollama-2", { model: "test" }, adapter);
    agent.init({ agentId: "ollama-2", seed: 2 });
    const action = await agent.act({ turn: 1 }, { agentId: "ollama-2", turn: 1, rng: () => 0.5 });

    expect(action).toEqual({ type: "wait" });
  });

  it("falls back when LLM request fails", async () => {
    vi.spyOn(llmClient, "generatePlainText").mockRejectedValue(new Error("LLM down"));

    const adapter = {
      systemPrompt: "system",
      formatObservation: vi.fn(() => "formatted obs"),
      parseResponse: vi.fn(() => ({ type: "wait" })),
      fallbackAction: { type: "wait" },
    };

    const agent = createOllamaAgent("ollama-3", { model: "test" }, adapter);
    agent.init({ agentId: "ollama-3", seed: 3 });
    const action = await agent.act({ turn: 1 }, { agentId: "ollama-3", turn: 1, rng: () => 0.5 });

    expect(action).toEqual({ type: "wait" });
  });
});

async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/tags");
    return response.ok;
  } catch {
    return false;
  }
}

const ollamaAvailable = await isOllamaAvailable();

describe.skipIf(!ollamaAvailable)("ollama-heist integration", () => {
  it("runs a heist match and writes match.jsonl to a temp directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "hashmatch-ollama-"));
    const originalAllow = process.env.HASHMATCH_ALLOW_TOOLS;
    process.env.HASHMATCH_ALLOW_TOOLS = "true";

    try {
      const scenario = createHeistScenario();
      const agents = [createOllamaHeistAgent("ollama-0"), createOllamaHeistAgent("ollama-1")];
      const result = await runMatch(scenario, agents, { seed: 9, maxTurns: 5 });
      const jsonl = toStableJsonl(result.events);
      const outPath = join(tempDir, "match.jsonl");
      await writeFile(outPath, jsonl, "utf-8");

      const raw = await readFile(outPath, "utf-8");
      const lines = raw.trim().split("\n");
      expect(lines.length).toBeGreaterThan(0);
      expect(() => JSON.parse(lines[0])).not.toThrow();
    } finally {
      if (originalAllow === undefined) {
        delete process.env.HASHMATCH_ALLOW_TOOLS;
      } else {
        process.env.HASHMATCH_ALLOW_TOOLS = originalAllow;
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
