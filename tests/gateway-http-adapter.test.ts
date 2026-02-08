import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpAdapter } from "../src/gateway/httpAdapter.js";

const baseRequest = {
  protocolVersion: "0.1.0" as const,
  matchId: "match-1",
  turn: 1,
  agentId: "agent-1",
  deadlineMs: 1000,
  turnStartedAt: new Date().toISOString(),
  gameId: "test-game",
  gameVersion: "0.1.0",
  observation: { hint: "go" },
};

function createTestServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

describe("createHttpAdapter", () => {
  let closeServer: (() => Promise<void>) | null = null;

  beforeEach(() => {
    closeServer = null;
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it("returns action on 200 response", async () => {
    const { url, close } = await createTestServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          protocolVersion: "0.1.0",
          matchId: baseRequest.matchId,
          turn: baseRequest.turn,
          agentId: baseRequest.agentId,
          action: { move: "ok" },
        }),
      );
    });
    closeServer = close;

    const adapter = createHttpAdapter(url, { defaultDeadlineMs: 1000, maxResponseBytes: 1024 });
    const fallback = { move: "fallback" };

    const result = await adapter.requestAction(baseRequest, fallback);

    expect(result.action).toEqual({ move: "ok" });
    expect(result.transcript.status).toBe("ok");
    expect(result.transcript.fallbackApplied).toBe(false);
  });

  it("times out and uses fallback", async () => {
    const { url, close } = await createTestServer((_req, res) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            protocolVersion: "0.1.0",
            matchId: baseRequest.matchId,
            turn: baseRequest.turn,
            agentId: baseRequest.agentId,
            action: { move: "late" },
          }),
        );
      }, 200);
    });
    closeServer = close;

    const adapter = createHttpAdapter(url, { defaultDeadlineMs: 10, maxResponseBytes: 1024 });
    const fallback = { move: "fallback" };

    const result = await adapter.requestAction({ ...baseRequest, deadlineMs: 10 }, fallback);

    expect(result.action).toEqual(fallback);
    expect(result.transcript.status).toBe("timeout");
    expect(result.transcript.fallbackApplied).toBe(true);
  });

  it("retries non-2xx responses and falls back after retry", async () => {
    let attempts = 0;
    const { url, close } = await createTestServer((_req, res) => {
      attempts += 1;
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "server" }));
    });
    closeServer = close;

    const adapter = createHttpAdapter(url, {
      defaultDeadlineMs: 1000,
      maxResponseBytes: 1024,
      retryPolicy: { maxRetries: 1 },
    });
    const fallback = { move: "fallback" };

    const result = await adapter.requestAction(baseRequest, fallback);

    expect(attempts).toBe(2);
    expect(result.action).toEqual(fallback);
    expect(result.transcript.status).toBe("error");
    expect(result.transcript.fallbackApplied).toBe(true);
  });

  it("falls back on invalid JSON", async () => {
    const { url, close } = await createTestServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end("not-json");
    });
    closeServer = close;

    const adapter = createHttpAdapter(url, { defaultDeadlineMs: 1000, maxResponseBytes: 1024 });
    const fallback = { move: "fallback" };

    const result = await adapter.requestAction(baseRequest, fallback);

    expect(result.action).toEqual(fallback);
    expect(result.transcript.status).toBe("invalid_response");
    expect(result.transcript.fallbackApplied).toBe(true);
  });
});
