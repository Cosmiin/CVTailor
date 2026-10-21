import { describe, expect, it } from "vitest";
import { parseTranscriptionUsage } from "../../../supabase/functions/_shared/transcription-usage";

describe("transcription usage parsing", () => {
  it("preserves provider-reported duration usage without inventing tokens", () => {
    expect(parseTranscriptionUsage({ type: "duration", seconds: 90.25 })).toEqual({
      type: "duration",
      seconds: 90.25,
      inputTokens: 0,
      audioInputTokens: 0,
      textInputTokens: 0,
      outputTokens: 0,
    });
  });

  it("preserves token-billed transcription usage and its audio breakdown", () => {
    expect(parseTranscriptionUsage({
      type: "tokens",
      input_tokens: 140,
      input_token_details: { audio_tokens: 120, text_tokens: 20 },
      output_tokens: 45,
      total_tokens: 185,
    })).toEqual({
      type: "tokens",
      seconds: 0,
      inputTokens: 140,
      audioInputTokens: 120,
      textInputTokens: 20,
      outputTokens: 45,
    });
  });

  it("keeps missing provider usage as an explicit unpriced event", () => {
    expect(parseTranscriptionUsage(undefined).type).toBe("unknown");
  });
});
