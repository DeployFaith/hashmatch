import { stableStringify } from "../core/json.js";
import type {
  AgentAdapter,
  GatewayActionResponse,
  GatewayConfig,
  GatewayObservationRequest,
  GatewayRetryPolicy,
  GatewayTranscriptEntry,
} from "./types.js";

class HttpStatusError extends Error {
  status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

class ResponseTooLargeError extends Error {
  constructor(limit: number) {
    super(`Response exceeded ${limit} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

function resolveDeadlineMs(request: GatewayObservationRequest, config?: GatewayConfig): number {
  if (Number.isFinite(request.deadlineMs) && request.deadlineMs > 0) {
    return request.deadlineMs;
  }
  if (config && Number.isFinite(config.defaultDeadlineMs) && config.defaultDeadlineMs > 0) {
    return config.defaultDeadlineMs;
  }
  return 0;
}

function resolveMaxResponseBytes(
  request: GatewayObservationRequest,
  config?: GatewayConfig,
): number {
  const constraintMax = request.constraints?.maxResponseBytes;
  const configMax = config?.maxResponseBytes;
  const constraintValid =
    typeof constraintMax === "number" && Number.isFinite(constraintMax) && constraintMax > 0;
  const configValid = typeof configMax === "number" && Number.isFinite(configMax) && configMax > 0;

  if (constraintValid && configValid) {
    return Math.min(constraintMax as number, configMax as number);
  }
  if (constraintValid) {
    return constraintMax as number;
  }
  if (configValid) {
    return configMax as number;
  }
  return Number.POSITIVE_INFINITY;
}

function resolveMaxRetries(policy?: GatewayRetryPolicy): number {
  if (!policy) {
    return 0;
  }
  const candidate =
    typeof policy.maxRetries === "number"
      ? policy.maxRetries
      : typeof policy.retries === "number"
        ? policy.retries
        : typeof policy.maxAttempts === "number"
          ? policy.maxAttempts
          : 0;
  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.floor(candidate);
  }
  return 0;
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(stableStringify(value), "utf-8");
}

async function readResponseBody(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number }> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const length = Number.parseInt(contentLength, 10);
    if (Number.isFinite(length) && maxBytes !== Number.POSITIVE_INFINITY && length > maxBytes) {
      response.body?.cancel();
      throw new ResponseTooLargeError(maxBytes);
    }
  }

  if (!response.body) {
    return { text: "", bytes: 0 };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    bytes += value.length;
    if (maxBytes !== Number.POSITIVE_INFINITY && bytes > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: buffer.toString("utf-8"), bytes };
}

function parseActionResponse(
  payload: string,
  request: GatewayObservationRequest,
): GatewayActionResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidResponseError(`Invalid JSON: ${message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new InvalidResponseError("Response is not an object");
  }

  const response = parsed as GatewayActionResponse;
  if (response.protocolVersion !== "0.1.0") {
    throw new InvalidResponseError("Unsupported protocolVersion");
  }
  if (
    response.matchId !== request.matchId ||
    response.turn !== request.turn ||
    response.agentId !== request.agentId
  ) {
    throw new InvalidResponseError("Response does not match request identifiers");
  }
  if (!("action" in response)) {
    throw new InvalidResponseError("Missing action in response");
  }

  return response;
}

export function createHttpAdapter(endpointUrl: string, config?: GatewayConfig): AgentAdapter {
  return {
    async requestAction(request, fallbackAction) {
      const observationSentAt = new Date().toISOString();
      const startTime = Date.now();
      const deadlineMs = resolveDeadlineMs(request, config);
      const maxResponseBytes = resolveMaxResponseBytes(request, config);
      const maxRetries = resolveMaxRetries(config?.retryPolicy);
      const observationBytes = byteLength(request.observation);
      const requestBody = stableStringify(request);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let timeoutId: NodeJS.Timeout | undefined;
        const controller = new AbortController();
        let didTimeout = false;

        try {
          if (deadlineMs > 0) {
            timeoutId = setTimeout(() => {
              didTimeout = true;
              controller.abort();
            }, deadlineMs);
          }

          const response = await fetch(endpointUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: requestBody,
            signal: controller.signal,
          });

          if (!response.ok) {
            response.body?.cancel();
            throw new HttpStatusError(response.status);
          }

          const { text } = await readResponseBody(response, maxResponseBytes);
          const parsed = parseActionResponse(text, request);
          const action = parsed.action;
          const actionBytes = byteLength(action);
          const actionReceivedAt = new Date().toISOString();
          const responseTimeMs = Date.now() - startTime;

          const transcript: GatewayTranscriptEntry = {
            matchId: request.matchId,
            turn: request.turn,
            agentId: request.agentId,
            timestamp: actionReceivedAt,
            observationSentAt,
            observationBytes,
            actionReceivedAt,
            actionBytes,
            responseTimeMs,
            status: "ok",
            fallbackApplied: false,
          };
          return { action, transcript };
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          if (didTimeout || (error instanceof Error && error.name === "AbortError")) {
            const actionReceivedAt = new Date().toISOString();
            const responseTimeMs = Date.now() - startTime;
            const actionBytes = byteLength(fallbackAction);
            const transcript: GatewayTranscriptEntry = {
              matchId: request.matchId,
              turn: request.turn,
              agentId: request.agentId,
              timestamp: actionReceivedAt,
              observationSentAt,
              observationBytes,
              actionReceivedAt,
              actionBytes,
              responseTimeMs,
              status: "timeout",
              errorMessage: `Timed out after ${deadlineMs}ms`,
              fallbackApplied: true,
              fallbackAction,
            };
            return { action: fallbackAction, transcript };
          }

          if (error instanceof HttpStatusError && attempt < maxRetries) {
            continue;
          }

          if (error instanceof InvalidResponseError || error instanceof ResponseTooLargeError) {
            const actionReceivedAt = new Date().toISOString();
            const responseTimeMs = Date.now() - startTime;
            const actionBytes = byteLength(fallbackAction);
            const transcript: GatewayTranscriptEntry = {
              matchId: request.matchId,
              turn: request.turn,
              agentId: request.agentId,
              timestamp: actionReceivedAt,
              observationSentAt,
              observationBytes,
              actionReceivedAt,
              actionBytes,
              responseTimeMs,
              status: "invalid_response",
              errorMessage: error.message,
              fallbackApplied: true,
              fallbackAction,
            };
            return { action: fallbackAction, transcript };
          }

          const message = error instanceof Error ? error.message : String(error);
          const actionReceivedAt = new Date().toISOString();
          const responseTimeMs = Date.now() - startTime;
          const actionBytes = byteLength(fallbackAction);
          const transcript: GatewayTranscriptEntry = {
            matchId: request.matchId,
            turn: request.turn,
            agentId: request.agentId,
            timestamp: actionReceivedAt,
            observationSentAt,
            observationBytes,
            actionReceivedAt,
            actionBytes,
            responseTimeMs,
            status: "error",
            errorMessage: message,
            fallbackApplied: true,
            fallbackAction,
          };
          return { action: fallbackAction, transcript };
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      }

      const actionReceivedAt = new Date().toISOString();
      const responseTimeMs = Date.now() - startTime;
      const actionBytes = byteLength(fallbackAction);
      const transcript: GatewayTranscriptEntry = {
        matchId: request.matchId,
        turn: request.turn,
        agentId: request.agentId,
        timestamp: actionReceivedAt,
        observationSentAt,
        observationBytes,
        actionReceivedAt,
        actionBytes,
        responseTimeMs,
        status: "error",
        errorMessage: "Exhausted retries",
        fallbackApplied: true,
        fallbackAction,
      };
      return { action: fallbackAction, transcript };
    },
  };
}
