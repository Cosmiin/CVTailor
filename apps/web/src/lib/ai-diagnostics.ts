export type AiOperation = "evidence-analysis" | "evidence-synthesis" | "cv-tailoring";

type DiagnosticConsole = Pick<Console, "info" | "warn" | "error">;

type ProgressDetails = {
  runId?: string;
  stage?: string;
  providerStatus?: string;
  pollAttempt?: number;
  backendElapsedMs?: number;
};

type DiagnosticOptions = {
  console?: DiagnosticConsole;
  now?: () => number;
  operationId?: string;
};

const PREFIX = "[CV Maker][AI]";
const HEARTBEAT_MS = 30_000;
const SLOW_WARNING_MS = 120_000;

const safeIdentifier = (value: string | undefined) =>
  value?.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 160) || undefined;

export const createAiDiagnostics = (
  operation: AiOperation,
  context: { jobId: string },
  options: DiagnosticOptions = {},
) => {
  const output = options.console ?? console;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const operationId = options.operationId ?? crypto.randomUUID();
  let lastProgressSignature = "";
  let lastProgressAt = 0;
  let lastSlowWarning = 0;

  const base = () => ({
    timestamp: new Date(now()).toISOString(),
    operation,
    operationId,
    jobId: safeIdentifier(context.jobId),
    elapsedMs: Math.max(0, now() - startedAt),
  });

  const started = (stage = "sending_to_edge_function") => {
    output.info(`${PREFIX} started`, { ...base(), stage });
  };

  const progress = (details: ProgressDetails) => {
    const stage = safeIdentifier(details.stage) ?? "waiting_for_status";
    const providerStatus = safeIdentifier(details.providerStatus) ?? "unknown";
    const signature = `${stage}:${providerStatus}`;
    const current = now();
    const shouldEmit = signature !== lastProgressSignature || current - lastProgressAt >= HEARTBEAT_MS;
    if (shouldEmit) {
      output.info(`${PREFIX} progress`, {
        ...base(),
        runId: safeIdentifier(details.runId),
        stage,
        providerStatus,
        pollAttempt: details.pollAttempt,
        backendElapsedMs: details.backendElapsedMs,
      });
      lastProgressSignature = signature;
      lastProgressAt = current;
    }

    const elapsedMs = current - startedAt;
    const slowMilestone = Math.floor(elapsedMs / SLOW_WARNING_MS);
    if (slowMilestone > lastSlowWarning) {
      lastSlowWarning = slowMilestone;
      output.warn(`${PREFIX} still waiting`, {
        ...base(),
        runId: safeIdentifier(details.runId),
        blockedAt: stage,
        providerStatus,
        pollAttempt: details.pollAttempt,
        note: "The background operation is alive but has not reached a terminal state.",
      });
    }
  };

  const retry = (details: ProgressDetails & { retryNumber: number; nextRetryMs: number }) => {
    output.warn(`${PREFIX} polling retry`, {
      ...base(),
      runId: safeIdentifier(details.runId),
      stage: safeIdentifier(details.stage) ?? "polling_edge_function",
      providerStatus: safeIdentifier(details.providerStatus),
      pollAttempt: details.pollAttempt,
      retryNumber: details.retryNumber,
      nextRetryMs: details.nextRetryMs,
    });
  };

  const completed = (details: ProgressDetails = {}) => {
    output.info(`${PREFIX} completed`, {
      ...base(),
      runId: safeIdentifier(details.runId),
      stage: safeIdentifier(details.stage) ?? "completed",
      pollAttempt: details.pollAttempt,
      backendElapsedMs: details.backendElapsedMs,
    });
  };

  const failed = (error: unknown, details: ProgressDetails = {}) => {
    const raw = error instanceof Error ? error.message : String(error ?? "unknown_error");
    output.error(`${PREFIX} failed`, {
      ...base(),
      runId: safeIdentifier(details.runId),
      stage: safeIdentifier(details.stage) ?? "failed",
      providerStatus: safeIdentifier(details.providerStatus),
      pollAttempt: details.pollAttempt,
      error: raw.replace(/[\r\n]/g, " ").slice(0, 240),
    });
  };

  return { started, progress, retry, completed, failed };
};

