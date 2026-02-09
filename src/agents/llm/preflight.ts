import type { LlmAgentDescriptor, LlmProvider } from "./types.js";

export class LlmPreflightError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = "LlmPreflightError";
    this.details = details;
  }
}

const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const DEFAULT_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";

function resolveBaseUrl(provider: LlmProvider): string {
  if (provider === "openrouter") {
    return process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_ENDPOINT;
  }
  return process.env.OLLAMA_ENDPOINT?.trim() || DEFAULT_OLLAMA_ENDPOINT;
}

function withTimeout(input: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

async function ensureReachable(url: string, init: RequestInit, providerLabel: string): Promise<void> {
  let response: Response;
  try {
    response = await withTimeout(url, init);
  } catch {
    throw new Error(`${providerLabel} endpoint unreachable (${url})`);
  }
  if (!response.ok) {
    throw new Error(`${providerLabel} endpoint returned ${response.status}`);
  }
}

async function checkOpenRouterModels(model: string): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Missing OPENROUTER_API_KEY for OpenRouter provider.");
  }
  const baseUrl = resolveBaseUrl("openrouter");
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const response = await withTimeout(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter endpoint returned ${response.status}`);
  }
  const data = (await response.json()) as { data?: Array<{ id?: string }> };
  const models = data?.data?.map((entry) => entry.id).filter((id) => typeof id === "string");
  if (models && models.length > 0 && !models.includes(model)) {
    throw new Error(`OpenRouter model "${model}" not found in /models listing.`);
  }
}

async function checkOllamaModels(model: string): Promise<void> {
  const baseUrl = resolveBaseUrl("ollama");
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  const response = await withTimeout(url);
  if (!response.ok) {
    throw new Error(`Ollama endpoint returned ${response.status}`);
  }
  const data = (await response.json()) as { models?: Array<{ name?: string }> };
  const models = data?.models?.map((entry) => entry.name).filter((id) => typeof id === "string");
  if (models && models.length > 0 && !models.includes(model)) {
    throw new Error(`Ollama model "${model}" not found in /api/tags listing.`);
  }
}

export async function preflightValidateLlmAgents(agents: LlmAgentDescriptor[]): Promise<void> {
  const errors: string[] = [];
  const unique = new Map<string, LlmAgentDescriptor>();
  for (const agent of agents) {
    unique.set(`${agent.provider}:${agent.model}`, agent);
  }

  for (const agent of unique.values()) {
    try {
      if (agent.provider === "openrouter") {
        await checkOpenRouterModels(agent.model);
      } else if (agent.provider === "ollama") {
        const baseUrl = resolveBaseUrl("ollama");
        await ensureReachable(`${baseUrl.replace(/\/$/, "")}/api/tags`, {}, "Ollama");
        await checkOllamaModels(agent.model);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    throw new LlmPreflightError("LLM preflight validation failed.", errors);
  }
}
