import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelUsage } from "ai";
import type { ZodType } from "zod";
import type { LlmProvider } from "./types.js";

export interface LlmProviderClientConfig {
  provider: LlmProvider;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}

export interface LlmStructuredResult<T> {
  object: T;
  usage: LanguageModelUsage | undefined;
  finishReason: string;
  responseBody: unknown;
}

export interface LlmTextResult {
  text: string;
  usage: LanguageModelUsage | undefined;
  finishReason: string;
  responseBody: unknown;
}

export function createProviderClient(config: LlmProviderClientConfig) {
  const baseURL = config.baseUrl;
  const apiKey = config.apiKey;
  const providerName = config.provider;
  const provider = createOpenAI({
    baseURL,
    apiKey,
    name: providerName,
  });
  return provider(config.model);
}

export async function generateStructured<T>(
  config: LlmProviderClientConfig,
  params: {
    system: string;
    prompt: string;
    schema: ZodType<T>;
  },
): Promise<LlmStructuredResult<T>> {
  const model = createProviderClient(config);
  const result = await generateObject({
    model,
    system: params.system,
    prompt: params.prompt,
    schema: params.schema,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxOutputTokens !== undefined ? { maxOutputTokens: config.maxOutputTokens } : {}),
  });
  return {
    object: result.object,
    usage: result.usage,
    finishReason: result.finishReason,
    responseBody: result.response?.body,
  };
}

export async function generatePlainText(
  config: LlmProviderClientConfig,
  params: {
    system: string;
    prompt: string;
  },
): Promise<LlmTextResult> {
  const model = createProviderClient(config);
  const result = await generateText({
    model,
    system: params.system,
    prompt: params.prompt,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxOutputTokens !== undefined ? { maxOutputTokens: config.maxOutputTokens } : {}),
  });
  return {
    text: result.text,
    usage: result.usage,
    finishReason: result.finishReason,
    responseBody: result.response?.body,
  };
}
