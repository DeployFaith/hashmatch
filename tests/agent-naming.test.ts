import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentFactory } from "../src/tournament/runTournament.js";
import * as llmAgentModule from "../src/agents/llm/createLlmAgent.js";

type LlmAgent = ReturnType<typeof llmAgentModule.createLlmAgent>;

const originalEnv = {
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  OLLAMA_MODEL_0: process.env.OLLAMA_MODEL_0,
};

afterEach(() => {
  vi.restoreAllMocks();
  if (originalEnv.OLLAMA_MODEL === undefined) {
    delete process.env.OLLAMA_MODEL;
  } else {
    process.env.OLLAMA_MODEL = originalEnv.OLLAMA_MODEL;
  }
  if (originalEnv.OLLAMA_MODEL_0 === undefined) {
    delete process.env.OLLAMA_MODEL_0;
  } else {
    process.env.OLLAMA_MODEL_0 = originalEnv.OLLAMA_MODEL_0;
  }
});

describe("agent naming", () => {
  it("resolves ollama-heist alias with deprecation warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const factory = getAgentFactory("ollama-heist", { scenarioKey: "heist", slotIndex: 0 });
    const agent = factory("ollama-heist-0");

    expect(typeof agent.act).toBe("function");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("deprecated");

    getAgentFactory("ollama-heist", { scenarioKey: "heist", slotIndex: 0 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves llm:ollama with scenario heist", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const factory = getAgentFactory("llm:ollama:qwen2.5:3b", {
      scenarioKey: "heist",
      slotIndex: 0,
    });
    const agent = factory("llm:ollama:qwen2.5:3b-0");

    expect(typeof agent.act).toBe("function");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("throws when llm:ollama is missing a model", () => {
    expect(() => getAgentFactory("llm:ollama")).toThrow(/llm:<provider>:<model>/);
  });

  it("throws when llm:ollama is missing a scenario", () => {
    expect(() => getAgentFactory("llm:ollama:qwen2.5:3b")).toThrow(/requires --scenario/);
  });

  it("throws when llm provider is unknown", () => {
    expect(() =>
      getAgentFactory("llm:banana:model", { scenarioKey: "heist", slotIndex: 0 }),
    ).toThrow(/Unknown LLM provider/);
    expect(() =>
      getAgentFactory("llm:banana:model", { scenarioKey: "heist", slotIndex: 0 }),
    ).toThrow(/ollama/);
  });

  it("throws when scenario adapter is unknown", () => {
    expect(() =>
      getAgentFactory("llm:ollama:qwen2.5:3b", { scenarioKey: "nonexistent", slotIndex: 0 }),
    ).toThrow(/No LLM adapter/);
    expect(() =>
      getAgentFactory("llm:ollama:qwen2.5:3b", { scenarioKey: "nonexistent", slotIndex: 0 }),
    ).toThrow(/heist/);
  });

  it("warns once for stub adapters", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    getAgentFactory("llm:ollama:qwen2.5:3b", { scenarioKey: "resourceRivals", slotIndex: 0 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("stub");

    getAgentFactory("llm:ollama:qwen2.5:3b", { scenarioKey: "resourceRivals", slotIndex: 0 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps scripted agents unchanged", () => {
    const randomFactory = getAgentFactory("random", { scenarioKey: "numberGuess", slotIndex: 0 });
    const randomAgent = randomFactory("random-0");
    expect(typeof randomAgent.act).toBe("function");

    const baselineFactory = getAgentFactory("baseline", { scenarioKey: "numberGuess", slotIndex: 1 });
    const baselineAgent = baselineFactory("baseline-1");
    expect(typeof baselineAgent.act).toBe("function");
  });

  it("prefers model in the key over global env override", () => {
    process.env.OLLAMA_MODEL = "phi3:latest";
    const createSpy = vi
      .spyOn(llmAgentModule, "createLlmAgent")
      .mockImplementation((id, _config, _adapter) => ({
        id,
        init: () => {},
        act: () => ({}),
      }) as LlmAgent);

    const factory = getAgentFactory("llm:ollama:qwen2.5:3b", {
      scenarioKey: "heist",
      slotIndex: 0,
    });
    factory("llm:ollama:qwen2.5:3b-0");

    expect(createSpy).toHaveBeenCalled();
    const config = createSpy.mock.calls[0]?.[1] as { model?: string };
    expect(config?.model).toBe("qwen2.5:3b");
  });

  it("keeps per-slot override behavior for ollama-heist", () => {
    process.env.OLLAMA_MODEL_0 = "phi3:mini";
    const createSpy = vi
      .spyOn(llmAgentModule, "createLlmAgent")
      .mockImplementation((id, _config, _adapter) => ({
        id,
        init: () => {},
        act: () => ({}),
      }) as LlmAgent);

    const factory = getAgentFactory("ollama-heist", { scenarioKey: "heist", slotIndex: 0 });
    factory("ollama-heist-0");

    const config = createSpy.mock.calls[0]?.[1] as { model?: string };
    expect(config?.model).toBe("phi3:mini");
  });

  it("keeps llm:ollama agent ids unique across slots", () => {
    const factoryA = getAgentFactory("llm:ollama:qwen2.5:3b", {
      scenarioKey: "heist",
      slotIndex: 0,
    });
    const factoryB = getAgentFactory("llm:ollama:qwen2.5:3b", {
      scenarioKey: "heist",
      slotIndex: 1,
    });
    const agentA = factoryA("llm:ollama:qwen2.5:3b-0");
    const agentB = factoryB("llm:ollama:qwen2.5:3b-1");
    expect(agentA.id).not.toBe(agentB.id);
  });
});
