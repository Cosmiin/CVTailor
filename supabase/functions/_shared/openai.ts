export const runStructuredResponse = async (
  schemaName: string,
  schema: Record<string, unknown>,
  instructions: string,
  input: string,
  options: { modelEnv?: string } = {},
) => {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("openai_not_configured");
  const model = (options.modelEnv ? Deno.env.get(options.modelEnv) : null) ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-6.1-sol";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input,
      tools: [],
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  });
  if (!response.ok) throw new Error(`openai_${response.status}`);
  const payload = await response.json();
  if (payload.status && payload.status !== "completed") throw new Error(`openai_${payload.status}`);
  const refusal = payload.output?.flatMap((item: any) => item.content ?? [])
    .find((content: any) => content.type === "refusal");
  if (refusal) throw new Error("openai_refusal");
  const outputText = payload.output_text ?? payload.output?.flatMap((item: any) => item.content ?? [])
    .find((content: any) => content.type === "output_text")?.text;
  if (!outputText) throw new Error("openai_empty_output");
  return {
    value: JSON.parse(outputText),
    model,
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
  };
};
