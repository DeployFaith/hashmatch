import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../src/cli/run-match.js";

describe("run-match CLI help", () => {
  it("prints usage and exits 0", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);

    try {
      parseArgs(["--help"]);
    } catch (error) {
      expect((error as Error).message).toBe("process.exit:0");
    }

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("--gateway");
    expect(exitSpy).toHaveBeenCalledWith(0);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
