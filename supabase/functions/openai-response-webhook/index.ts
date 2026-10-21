import OpenAI from "npm:openai@6";
import { adminClient } from "../_shared/http.ts";
import { processJobParseQueue } from "../_shared/job-parse-finalizer.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const supportedEvents = new Set([
  "response.completed",
  "response.failed",
  "response.incomplete",
  "response.cancelled",
]);

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const webhookSecret = Deno.env.get("OPENAI_WEBHOOK_SECRET");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!webhookSecret || !apiKey) return response({ error: "webhook_not_configured" }, 503);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 262_144) return response({ error: "payload_too_large" }, 413);

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 262_144) {
    return response({ error: "payload_too_large" }, 413);
  }

  let event: any;
  try {
    const openai = new OpenAI({ apiKey });
    event = await openai.webhooks.unwrap(rawBody, request.headers, webhookSecret);
  } catch {
    return response({ error: "invalid_webhook_signature" }, 400);
  }

  const eventType = String(event?.type ?? "");
  if (!supportedEvents.has(eventType)) return response({ received: true, ignored: true });

  const webhookId = String(request.headers.get("webhook-id") ?? "");
  const responseId = String(event?.data?.id ?? "");
  if (!webhookId || !/^resp_[A-Za-z0-9_-]+$/.test(responseId)) {
    return response({ error: "invalid_webhook_event" }, 400);
  }

  const admin = adminClient();
  const { data: job, error: lookupError } = await admin.from("jobs").select("id,parse_status")
    .eq("parse_response_id", responseId).maybeSingle();
  if (lookupError) return response({ error: "webhook_lookup_failed" }, 500);
  if (!job || job.parse_status !== "pending") return response({ received: true, ignored: true });

  const { error: insertError } = await admin.from("openai_response_events").insert({
    webhook_id: webhookId.slice(0, 200),
    response_id: responseId.slice(0, 200),
    event_type: eventType,
  });
  if (insertError && insertError.code !== "23505") {
    return response({ error: "webhook_enqueue_failed" }, 500);
  }
  if (insertError?.code === "23505") return response({ received: true, duplicate: true });

  EdgeRuntime.waitUntil(processJobParseQueue(admin, 10).catch((error) => {
    console.error("OpenAI webhook background finalization failed", error);
  }));
  return response({ received: true }, 202);
});
