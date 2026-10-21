import { parseStructuredResponse, responseUsage, retrieveStructuredResponse } from "./openai.ts";
import { jobStructuredSchema } from "./schema.ts";
import { recordAiUsage } from "./usage.ts";

const normalize = (text: string, maxLength = 100_000) => text
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim()
  .slice(0, maxLength);

const isoDate = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

const transientProviderError = (code: string) =>
  code === "openai_request_failed" || code === "openai_timeout" || /^openai_(429|5\d\d|slow_down|server_is_overloaded)$/.test(code);

const parseCompletedResponse = (payload: any, modelFallback?: string) => {
  const result = parseStructuredResponse(payload, modelFallback);
  const parsed = jobStructuredSchema.parse(result.value);
  const warnings = [...parsed.warnings];
  const datePosted = isoDate(parsed.datePosted);
  const validThrough = isoDate(parsed.validThrough);
  if (parsed.datePosted && !datePosted) warnings.push("Ignored an invalid or ambiguous posting date.");
  if (parsed.validThrough && !validThrough) warnings.push("Ignored an invalid or ambiguous closing date.");
  return {
    value: jobStructuredSchema.parse({ ...parsed, datePosted, validThrough, warnings: [...new Set(warnings)] }),
    model: result.model,
    responseId: result.responseId,
  };
};

const releaseClaim = async (client: any, job: any, code: string, delaySeconds: number) => {
  const nextCheck = new Date(Date.now() + delaySeconds * 1000).toISOString();
  const { data } = await client.from("jobs").update({
    parse_finalization_status: "waiting",
    parse_finalization_claimed_at: null,
    parse_next_check_at: nextCheck,
    parse_finalization_error: normalize(code, 120),
  }).eq("id", job.id).eq("parse_response_id", job.parse_response_id).eq("parse_status", "pending").select().maybeSingle();
  return data ?? job;
};

export const markJobParseFailed = async (
  client: any,
  jobId: string,
  userId: string,
  error: unknown,
  responseId?: string | null,
) => {
  const parseCode = normalize(error instanceof Error ? error.message : "job_parse_failed", 120);
  let query = client.from("jobs").update({
    parse_status: "failed",
    parse_warnings: [parseCode],
    structured_data: null,
    parsed_at: new Date().toISOString(),
    parse_provider_status: "failed",
    parse_finalization_status: "failed",
    parse_finalization_claimed_at: null,
    parse_next_check_at: null,
    parse_finalization_error: parseCode,
  }).eq("id", jobId).eq("user_id", userId);
  if (responseId) query = query.eq("parse_response_id", responseId).eq("parse_status", "pending");
  const { data, error: saveError } = await query.select().maybeSingle();
  if (saveError) throw new Error("job_parse_failure_save_failed");
  return data;
};

const saveParsedJob = async (client: any, job: any, parsed: ReturnType<typeof parseCompletedResponse>) => {
  const value = parsed.value;
  const { data, error } = await client.from("jobs").update({
    title: value.title,
    company: value.company.displayName,
    structured_data: value,
    location: value.location.original ?? "",
    date_posted: value.datePosted,
    employment_type: value.employmentType,
    seniority: value.seniority,
    salary_min: value.compensation.minimum,
    salary_max: value.compensation.maximum,
    salary_currency: value.compensation.currency,
    salary_period: value.compensation.period,
    source_language: value.sourceLanguage,
    parse_status: "completed",
    parse_warnings: value.warnings,
    parsed_at: new Date().toISOString(),
    parser_model: parsed.model,
    parse_provider_status: "completed",
    parse_finalization_status: "completed",
    parse_finalization_claimed_at: null,
    parse_next_check_at: null,
    parse_finalization_error: null,
  }).eq("id", job.id).eq("user_id", job.user_id).eq("parse_response_id", job.parse_response_id)
    .eq("parse_status", "pending").select().maybeSingle();
  if (error) throw new Error("job_parse_save_failed");
  return data;
};

export type JobParseFinalization = {
  state: "pending" | "completed" | "failed" | "busy" | "ignored";
  job: any | null;
  retryable?: boolean;
};

export const finalizeJobParseResponse = async (
  client: any,
  responseId: string,
): Promise<JobParseFinalization> => {
  const { data: existing, error: findError } = await client.from("jobs").select("*")
    .eq("parse_response_id", responseId).maybeSingle();
  if (findError) throw new Error("job_parse_lookup_failed");
  if (!existing) return { state: "ignored", job: null };
  if (existing.parse_status !== "pending") {
    return { state: existing.parse_status === "completed" ? "completed" : "failed", job: existing };
  }

  const { data: claimed, error: claimError } = await client.rpc("claim_job_parse_finalization", {
    p_response_id: responseId,
  }).maybeSingle();
  if (claimError) throw new Error("job_parse_claim_failed");
  if (!claimed) {
    const { data: current } = await client.from("jobs").select("*").eq("parse_response_id", responseId).maybeSingle();
    if (!current) return { state: "ignored", job: null };
    if (current.parse_status === "completed" || current.parse_status === "failed") {
      return { state: current.parse_status, job: current };
    }
    return { state: "busy", job: current, retryable: true };
  }

  let payload: any;
  try {
    payload = await retrieveStructuredResponse(responseId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "openai_request_failed";
    if (transientProviderError(code)) {
      const job = await releaseClaim(client, claimed, code, 30);
      return { state: "pending", job, retryable: true };
    }
    const job = await markJobParseFailed(client, claimed.id, claimed.user_id, error, responseId);
    return { state: "failed", job };
  }

  const providerStatus = String(payload.status ?? "unknown");
  if (providerStatus === "queued" || providerStatus === "in_progress") {
    const job = await releaseClaim(client, claimed, `openai_${providerStatus}`, 30);
    await client.from("jobs").update({ parse_provider_status: providerStatus })
      .eq("id", claimed.id).eq("parse_response_id", responseId).eq("parse_status", "pending");
    return { state: "pending", job: { ...job, parse_provider_status: providerStatus }, retryable: true };
  }

  try {
    await recordAiUsage(client, {
      userId: claimed.user_id,
      purpose: "job_parsing",
      result: responseUsage(payload, claimed.parser_model),
      operationKey: `job-parse:${claimed.id}:${responseId}`,
      jobId: claimed.id,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ai_usage_record_failed";
    const job = await releaseClaim(client, claimed, code, 30);
    return { state: "pending", job, retryable: true };
  }

  if (providerStatus !== "completed") {
    const reason = normalize(payload?.error?.code ?? payload?.incomplete_details?.reason ?? providerStatus, 100);
    const job = await markJobParseFailed(client, claimed.id, claimed.user_id, new Error(`openai_${reason}`), responseId);
    return { state: "failed", job };
  }

  try {
    const parsed = parseCompletedResponse(payload, claimed.parser_model);
    const job = await saveParsedJob(client, claimed, parsed);
    if (!job) {
      const { data: current } = await client.from("jobs").select("*").eq("id", claimed.id).maybeSingle();
      return { state: current?.parse_status === "completed" ? "completed" : "ignored", job: current };
    }
    return { state: "completed", job };
  } catch (error) {
    const job = await markJobParseFailed(client, claimed.id, claimed.user_id, error, responseId);
    return { state: "failed", job };
  }
};

const finishEvent = async (client: any, event: any, result: JobParseFinalization) => {
  if (result.state === "pending" || result.state === "busy") {
    const delay = Math.min(30 * (2 ** Math.min(Number(event.attempt_count ?? 1) - 1, 4)), 300);
    await client.from("openai_response_events").update({
      status: "retry",
      next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
      started_at: null,
      last_error_code: result.state === "busy" ? "job_parse_busy" : "job_parse_pending",
    }).eq("webhook_id", event.webhook_id);
    return;
  }
  await client.from("openai_response_events").update({
    status: result.state === "ignored" ? "ignored" : result.state,
    processed_at: new Date().toISOString(),
    started_at: null,
    last_error_code: null,
  }).eq("webhook_id", event.webhook_id);
};

export const processJobParseQueue = async (client: any, limit = 10) => {
  const { data: events, error } = await client.rpc("claim_openai_response_events", { p_limit: limit });
  if (error) throw new Error("job_parse_event_claim_failed");
  const results: JobParseFinalization[] = [];
  for (const event of events ?? []) {
    try {
      const result = await finalizeJobParseResponse(client, event.response_id);
      results.push(result);
      await finishEvent(client, event, result);
    } catch (caught) {
      const code = normalize(caught instanceof Error ? caught.message : "job_parse_finalization_failed", 120);
      await client.from("openai_response_events").update({
        status: "retry",
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        started_at: null,
        last_error_code: code,
      }).eq("webhook_id", event.webhook_id);
    }
  }
  return results;
};

export const reconcilePendingJobParses = async (client: any, limit = 10) => {
  const due = new Date().toISOString();
  const staleStart = new Date(Date.now() - 90_000).toISOString();
  const { data: missingResponses } = await client.from("jobs").select("id,user_id")
    .eq("parse_status", "pending").is("parse_response_id", null).lt("updated_at", staleStart).limit(limit);
  for (const job of missingResponses ?? []) {
    await markJobParseFailed(client, job.id, job.user_id, new Error("job_parse_start_interrupted"));
  }

  const { data: jobs, error } = await client.from("jobs").select("parse_response_id")
    .eq("parse_status", "pending").not("parse_response_id", "is", null)
    .or(`parse_next_check_at.is.null,parse_next_check_at.lte.${due}`)
    .order("updated_at", { ascending: true }).limit(limit);
  if (error) throw new Error("job_parse_reconciliation_lookup_failed");

  const results: JobParseFinalization[] = [];
  for (const job of jobs ?? []) {
    results.push(await finalizeJobParseResponse(client, String(job.parse_response_id)));
  }
  return results;
};
