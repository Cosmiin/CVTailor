type StructuredResponseOptions = {
  modelEnv?: string;
  timeoutMs?: number;
  background?: boolean;
  metadata?: Record<string, string>;
  onUsage?: (usage: ResponseUsage) => Promise<void>;
};

export type ResponseUsage = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  responseId: string;
};

const openAIKey = () => {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("openai_not_configured");
  return key;
};

const openAIModel = (modelEnv?: string) =>
  (modelEnv ? Deno.env.get(modelEnv) : null) ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-6.1-sol";

export const openAITranscriptionModel = () => Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") ?? "gpt-transcribe";

const retryDelay = (response: Response, attempt: number) => {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 8_000);
  return Math.min(750 * (2 ** attempt) + Math.floor(Math.random() * 250), 5_000);
};

const requestOpenAI = async (url: string, init: RequestInit, timeoutMs: number) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) return await response.json();
      const body = await response.json().catch(() => ({}));
      const providerCode = String(body?.error?.code ?? "");
      const retryable = (response.status === 429 && providerCode === "slow_down") ||
        (response.status === 503 && providerCode === "server_is_overloaded");
      if (retryable && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new Error(`openai_${providerCode || response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("openai_")) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("openai_timeout");
      throw new Error("openai_request_failed");
    }
  }
  throw new Error("openai_request_failed");
};

export const responseUsage = (payload: any, modelFallback?: string): ResponseUsage => ({
  model: payload.model ?? modelFallback ?? "unknown",
  inputTokens: payload.usage?.input_tokens ?? 0,
  cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
  outputTokens: payload.usage?.output_tokens ?? 0,
  responseId: String(payload.id ?? ""),
});

export const parseStructuredResponse = (payload: any, modelFallback?: string) => {
  if (payload.status && payload.status !== "completed") throw new Error(`openai_${payload.status}`);
  const refusal = payload.output?.flatMap((item: any) => item.content ?? [])
    .find((content: any) => content.type === "refusal");
  if (refusal) throw new Error("openai_refusal");
  const outputText = payload.output_text ?? payload.output?.flatMap((item: any) => item.content ?? [])
    .find((content: any) => content.type === "output_text")?.text;
  if (!outputText) throw new Error("openai_empty_output");
  return {
    value: JSON.parse(outputText),
    ...responseUsage(payload, modelFallback),
  };
};

export const startStructuredResponse = async (
  schemaName: string,
  schema: Record<string, unknown>,
  instructions: string,
  input: string,
  options: StructuredResponseOptions = {},
) => {
  const model = openAIModel(options.modelEnv);
  const payload = await requestOpenAI("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAIKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input,
      tools: [],
      ...(options.background ? { background: true, store: true } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  }, options.timeoutMs ?? 60_000);
  return { payload, responseId: String(payload.id ?? ""), status: String(payload.status ?? ""), model };
};

export const retrieveStructuredResponse = async (responseId: string, timeoutMs = 20_000) => {
  if (!/^resp_[A-Za-z0-9_-]+$/.test(responseId)) throw new Error("openai_response_id_invalid");
  return await requestOpenAI(`https://api.openai.com/v1/responses/${responseId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${openAIKey()}`, "Content-Type": "application/json" },
  }, timeoutMs);
};

export const runStructuredResponse = async (
  schemaName: string,
  schema: Record<string, unknown>,
  instructions: string,
  input: string,
  options: StructuredResponseOptions = {},
) => {
  const started = await startStructuredResponse(schemaName, schema, instructions, input, options);
  if (options.onUsage) await options.onUsage(responseUsage(started.payload, started.model));
  return parseStructuredResponse(started.payload, started.model);
};

export const transcribeAudioFile = async (file: File) => {
  const model = openAITranscriptionModel();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      body.append("model", model);
      body.append("response_format", "json");
      body.append("languages[]", "en");
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAIKey()}` },
        body,
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) {
        const payload = await response.json();
        return { text: String(payload?.text ?? ""), model };
      }
      const payload = await response.json().catch(() => ({}));
      const providerCode = String(payload?.error?.code ?? "");
      const retryable = response.status === 429 || response.status === 503;
      if (retryable && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      if (response.status === 429) throw new Error("voice_transcription_rate_limited");
      throw new Error(`openai_${providerCode || response.status}`);
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith("openai_") || error.message.startsWith("voice_transcription_"))) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("voice_transcription_timeout");
      throw new Error("voice_transcription_failed");
    }
  }
  throw new Error("voice_transcription_failed");
};
