import { describe, expect, it } from "vitest";
import { getAgentFactory } from "../src/tournament/runTournament.js";

describe("scripted agent scenario guards", () => {
  it("throws when baseline is used with a non-numberGuess scenario", () => {
    expect(() => getAgentFactory("baseline", { scenarioKey: "heist", slotIndex: 0 })).toThrow(
      'Agent "baseline" is NumberGuess-only',
    );
  });

  it("allows baseline for numberGuess", () => {
    expect(() =>
      getAgentFactory("baseline", { scenarioKey: "numberGuess", slotIndex: 0 }),
    ).not.toThrow();
  });

  it("throws when scenarioKey is undefined (internal misuse)", () => {
    expect(() => getAgentFactory("baseline", { slotIndex: 0 })).toThrow("requires scenarioKey");
  });

  it("does not affect noop agent on any scenario", () => {
    expect(() => getAgentFactory("noop", { scenarioKey: "heist", slotIndex: 0 })).not.toThrow();
  });

  it("throws when random is used with a non-numberGuess scenario", () => {
    expect(() => getAgentFactory("random", { scenarioKey: "heist", slotIndex: 0 })).toThrow(
      "Agent \"random\" is NumberGuess-only",
    );
  });

  it("allows random for numberGuess", () => {
    expect(() => getAgentFactory("random", { scenarioKey: "numberGuess", slotIndex: 0 })).not.toThrow();
  });

  it("throws when random has no scenarioKey (internal misuse)", () => {
    expect(() => getAgentFactory("random", { slotIndex: 0 })).toThrow("requires scenarioKey");
  });
});
