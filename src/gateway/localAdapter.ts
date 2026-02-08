import { stableStringify } from "../core/json.js";
import type {
  AgentAdapter,
  GatewayConfig,
  GatewayObservationRequest,
  GatewayTranscriptEntry,
} from "./types.js";

type AgentFunction = (
  observation: GatewayObservationRequest["observation"],
) => Promise<unknown> | unknown;

function resolveDeadlineMs(request: GatewayObservationRequest, config?: GatewayConfig): number {
  if (Number.isFinite(request.deadlineMs) && request.deadlineMs > 0) {
    return request.deadlineMs;
  }
  if (config && Number.isFinite(config.defaultDeadlineMs) && config.defaultDeadlineMs > 0) {
    return config.defaultDeadlineMs;
  }
  return 0;
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(stableStringify(value), "utf-8");
}

export function createLocalAdapter(agentFn: AgentFunction, config?: GatewayConfig): AgentAdapter {
  return {
    async requestAction(request, fallbackAction) {
      const observationSentAt = new Date().toISOString();
      const startTime = Date.now();
      const deadlineMs = resolveDeadlineMs(request, config);
      const observationBytes = byteLength(request.observation);

      let status: GatewayTranscriptEntry["status"] = "ok";
      let errorMessage: string | undefined;
      let action: unknown = fallbackAction;
      let fallbackApplied = false;
      let timeoutId: NodeJS.Timeout | undefined;
      const abortController = new AbortController();

      try {
        const actionPromise = Promise.resolve().then(() => agentFn(request.observation));
        if (deadlineMs > 0) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              abortController.abort();
              reject(new Error(`Timed out after ${deadlineMs}ms`));
            }, deadlineMs);
          });
          action = await Promise.race([actionPromise, timeoutPromise]);
        } else {
          action = await actionPromise;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (abortController.signal.aborted) {
          status = "timeout";
        } else {
          status = "error";
        }
        errorMessage = message;
        fallbackApplied = true;
        action = fallbackAction;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }

      const actionReceivedAt = new Date().toISOString();
      const responseTimeMs = Date.now() - startTime;
      const actionBytes = byteLength(action);

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
        status,
        ...(errorMessage ? { errorMessage } : {}),
        fallbackApplied,
        ...(fallbackApplied ? { fallbackAction } : {}),
      };

      return { action, transcript };
    },
  };
}
