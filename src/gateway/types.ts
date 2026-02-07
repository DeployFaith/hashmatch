export interface GatewayObservationRequest {
  protocolVersion: "0.1.0";
  matchId: string;
  turn: number;
  agentId: string;
  deadlineMs: number;
  turnStartedAt: string;
  gameId: string;
  gameVersion: string;
  observation: unknown;
  constraints?: {
    maxOutputTokens?: number;
    maxResponseBytes?: number;
    allowedTools?: string[];
  };
}

export interface GatewayActionResponse {
  protocolVersion: "0.1.0";
  matchId: string;
  turn: number;
  agentId: string;
  action: unknown;
  meta?: {
    thinkingTimeMs?: number;
    modelId?: string;
    tokensUsed?: number;
  };
}

export interface GatewayTimeoutEvent {
  matchId: string;
  turn: number;
  agentId: string;
  timestamp: string;
  deadlineMs: number;
  turnStartedAt: string;
}

export interface GatewayTranscriptEntry {
  matchId: string;
  turn: number;
  agentId: string;
  timestamp: string;
  observationSentAt: string;
  observationBytes: number;
  actionReceivedAt?: string;
  actionBytes?: number;
  responseTimeMs: number;
  status: "ok" | "timeout" | "error" | "invalid_response";
  errorMessage?: string;
  fallbackApplied: boolean;
  fallbackAction?: unknown;
}

export interface AgentAdapter {
  requestAction(
    request: GatewayObservationRequest,
    fallbackAction: unknown,
  ): Promise<{ action: unknown; transcript: GatewayTranscriptEntry }>;
  onMatchStart?: (matchId: string, gameId: string, agentId: string) => void;
  onMatchEnd?: (matchId: string) => void;
}

export type GatewayRetryPolicy = Record<string, unknown>;

export interface GatewayConfig {
  defaultDeadlineMs: number;
  maxResponseBytes: number;
  retryPolicy?: GatewayRetryPolicy;
}
