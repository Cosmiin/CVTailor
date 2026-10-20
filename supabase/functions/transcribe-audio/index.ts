import { adminClient, handleOptions, json, requireUser } from "../_shared/http.ts";
import { openAITranscriptionModel, transcribeAudioFile } from "../_shared/openai.ts";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARACTERS = 2500;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/mp4", "video/mp4", "audio/m4a", "audio/x-m4a",
  "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg",
]);

const normalizeTranscript = (value: unknown) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const statusFor = (code: string) => {
  if (code === "authentication_required") return 401;
  if (code === "account_disabled") return 403;
  if (code === "voice_transcription_invalid_audio" || code === "voice_transcript_empty" || code === "voice_transcript_too_long") return 400;
  if (code === "voice_transcription_file_too_large") return 413;
  if (code === "voice_transcription_rate_limited" || code === "voice_transcription_busy") return 429;
  if (code === "voice_transcription_timeout") return 504;
  return 502;
};

Deno.serve(async (request) => {
  const preflight = handleOptions(request); if (preflight) return preflight;
  let runId = "";
  let admin: ReturnType<typeof adminClient> | null = null;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_AUDIO_BYTES + 64_000) {
      return json(request, { error: "voice_transcription_file_too_large" }, 413);
    }

    const { client } = await requireUser(request);
    admin = adminClient();
    let form: FormData;
    try { form = await request.formData(); }
    catch { return json(request, { error: "voice_transcription_invalid_audio" }, 400); }

    const candidate = form.get("file");
    if (!(candidate instanceof File) || candidate.size <= 0) {
      return json(request, { error: "voice_transcription_invalid_audio" }, 400);
    }
    if (candidate.size > MAX_AUDIO_BYTES) {
      return json(request, { error: "voice_transcription_file_too_large" }, 413);
    }
    const contentType = candidate.type.toLowerCase().split(";")[0];
    if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
      return json(request, { error: "voice_transcription_invalid_audio" }, 400);
    }

    const reservation = await client.rpc("reserve_voice_transcription", { p_audio_bytes: candidate.size });
    if (reservation.error || !reservation.data) {
      const message = reservation.error?.message ?? "voice_transcription_failed";
      const code = message.includes("voice_transcription_rate_limited") ? "voice_transcription_rate_limited"
        : message.includes("voice_transcription_busy") ? "voice_transcription_busy"
        : message.includes("account_disabled") ? "account_disabled"
        : message.includes("voice_transcription_invalid_audio") ? "voice_transcription_invalid_audio"
        : "voice_transcription_failed";
      return json(request, { error: code }, statusFor(code));
    }
    runId = String(reservation.data);
    const configuredModel = openAITranscriptionModel();
    await admin.from("voice_transcription_runs").update({ model: configuredModel }).eq("id", runId).eq("status", "reserved");

    const result = await transcribeAudioFile(candidate);
    const text = normalizeTranscript(result.text);
    if (!text) throw new Error("voice_transcript_empty");
    if (text.length > MAX_TRANSCRIPT_CHARACTERS) throw new Error("voice_transcript_too_long");

    await admin.from("voice_transcription_runs").update({
      status: "completed", model: result.model, completed_at: new Date().toISOString(),
    }).eq("id", runId).eq("status", "reserved");
    return json(request, { text });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "voice_transcription_failed";
    const code = raw === "voice_transcription_timeout" || raw === "voice_transcription_rate_limited" ||
        raw === "voice_transcript_empty" || raw === "voice_transcript_too_long" || raw === "authentication_required" ||
        raw === "account_disabled"
      ? raw : "voice_transcription_failed";
    if (admin && runId) {
      await admin.from("voice_transcription_runs").update({
        status: "failed", completed_at: new Date().toISOString(),
      }).eq("id", runId).eq("status", "reserved");
    }
    return json(request, { error: code }, statusFor(code));
  }
});
