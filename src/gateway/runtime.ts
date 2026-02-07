import type { AgentId } from "../contract/types.js";
import type { AgentAdapter, GatewayConfig } from "./types.js";
import type { TranscriptWriter } from "./transcript.js";

export interface GatewayRuntimeConfig {
  mode: "local" | "http";
  config: GatewayConfig;
  adapters?: Map<AgentId, AgentAdapter>;
  transcriptWriter?: TranscriptWriter;
  gameId?: string;
  gameVersion?: string;
}
