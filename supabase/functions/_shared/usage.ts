export type AiUsagePurpose =
  | "cv_parsing"
  | "job_parsing"
  | "experience_questions"
  | "experience_synthesis"
  | "job_analysis"
  | "job_synthesis"
  | "cv_tailoring";

export type AiUsageRecord = {
  id: string;
  purpose: AiUsagePurpose;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  createdAt: string;
};

type UsageResult = {
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  responseId?: string;
};

export const recordAiUsage = async (
  admin: any,
  input: {
    userId: string;
    purpose: AiUsagePurpose;
    result: UsageResult;
    operationKey?: string;
    jobId?: string;
    tailorRunId?: string;
  },
): Promise<AiUsageRecord> => {
  const providerResponseId = input.result.responseId || null;
  const operationKey = input.operationKey ?? (providerResponseId ? `openai:${providerResponseId}` : crypto.randomUUID());
  const { data, error } = await admin.rpc("record_ai_usage", {
    p_operation_key: operationKey,
    p_user_id: input.userId,
    p_purpose: input.purpose,
    p_model: input.result.model,
    p_input_tokens: input.result.inputTokens,
    p_cached_input_tokens: input.result.cachedInputTokens ?? 0,
    p_output_tokens: input.result.outputTokens,
    p_provider_response_id: providerResponseId,
    p_job_id: input.jobId ?? null,
    p_tailor_run_id: input.tailorRunId ?? null,
  });
  if (error || !data) throw new Error("ai_usage_record_failed");
  return data as AiUsageRecord;
};
