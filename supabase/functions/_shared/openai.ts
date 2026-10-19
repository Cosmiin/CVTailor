type StructuredResponseOptions = {
  modelEnv?: string;
  timeoutMs?: number;
  background?: boolean;
  metadata?: Record<string, string>;
};

const openAIKey = () => {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("openai_not_configured");
  return key;
};

const openAIModel = (modelEnv?: string) =>
  (modelEnv ? Deno.env.get(modelEnv) : null) ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-6.1-sol";

const requestOpenAI = async (url: string, init: RequestInit, timeoutMs: number) => {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`openai_${response.status}`);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("openai_")) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("openai_timeout");
    throw new Error("openai_request_failed");
  }
};

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
    model: payload.model ?? modelFallback ?? "unknown",
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
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
  return parseStructuredResponse(started.payload, started.model);
};
