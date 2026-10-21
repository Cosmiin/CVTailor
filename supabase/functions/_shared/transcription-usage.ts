export type TranscriptionUsage =
  | { type: "duration"; seconds: number; inputTokens: 0; audioInputTokens: 0; textInputTokens: 0; outputTokens: 0 }
  | { type: "tokens"; seconds: 0; inputTokens: number; audioInputTokens: number; textInputTokens: number; outputTokens: number }
  | { type: "unknown"; seconds: 0; inputTokens: 0; audioInputTokens: 0; textInputTokens: 0; outputTokens: 0 };

const nonNegativeNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const nonNegativeInteger = (value: unknown) => Math.floor(nonNegativeNumber(value));

export const parseTranscriptionUsage = (value: unknown): TranscriptionUsage => {
  if (!value || typeof value !== "object") {
    return { type: "unknown", seconds: 0, inputTokens: 0, audioInputTokens: 0, textInputTokens: 0, outputTokens: 0 };
  }
  const usage = value as Record<string, unknown>;
  if (usage.type === "duration" || (usage.type === undefined && usage.seconds !== undefined)) {
    return {
      type: "duration",
      seconds: nonNegativeNumber(usage.seconds),
      inputTokens: 0,
      audioInputTokens: 0,
      textInputTokens: 0,
      outputTokens: 0,
    };
  }
  if (usage.type === "tokens" || usage.input_tokens !== undefined || usage.output_tokens !== undefined) {
    const details = usage.input_token_details && typeof usage.input_token_details === "object"
      ? usage.input_token_details as Record<string, unknown>
      : {};
    const inputTokens = nonNegativeInteger(usage.input_tokens);
    const audioInputTokens = Math.min(nonNegativeInteger(details.audio_tokens), inputTokens);
    const textInputTokens = Math.min(nonNegativeInteger(details.text_tokens), Math.max(inputTokens - audioInputTokens, 0));
    return {
      type: "tokens",
      seconds: 0,
      inputTokens,
      audioInputTokens,
      textInputTokens,
      outputTokens: nonNegativeInteger(usage.output_tokens),
    };
  }
  return { type: "unknown", seconds: 0, inputTokens: 0, audioInputTokens: 0, textInputTokens: 0, outputTokens: 0 };
};
