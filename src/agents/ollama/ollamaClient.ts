export interface OllamaConfig {
  model: string;
  endpoint?: string;
  timeoutMs?: number;
  options?: Record<string, unknown>;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildUrl(endpoint: string): string {
  return `${endpoint.replace(/\/$/, "")}/v1/chat/completions`;
}

export async function ollamaChat(
  config: OllamaConfig,
  messages: OllamaChatMessage[],
): Promise<string> {
  const endpoint = config.endpoint ?? "http://localhost:11434";
  const timeoutMs = config.timeoutMs ?? 30000;
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
  };

  if (config.options && Object.keys(config.options).length > 0) {
    Object.assign(payload, config.options);
  }

  const controller = new AbortController();
  const fetchPromise = fetch(buildUrl(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        return `ERROR: Ollama returned status ${response.status}`;
      }
      try {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          message?: { content?: string };
        };
        if (typeof data?.choices?.[0]?.message?.content === "string") {
          return data.choices[0].message.content;
        }
        if (typeof data?.message?.content === "string") {
          return data.message.content;
        }
      } catch {
        // fall through to error string
      }
      return "ERROR: Ollama returned invalid response";
    })
    .catch(() => "ERROR: Ollama unreachable");

  if (timeoutMs <= 0) {
    return fetchPromise;
  }

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<string>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve("ERROR: Ollama unreachable");
    }, timeoutMs);
  });

  const result = await Promise.race([fetchPromise, timeoutPromise]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  return result;
}
