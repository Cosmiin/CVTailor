// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAiDiagnostics } from "./ai-diagnostics";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("AI browser diagnostics", () => {
  it("logs state changes and periodic heartbeats without prompt content", () => {
    let time = 1_000;
    const output = logger();
    const diagnostics = createAiDiagnostics("cv-tailoring", { jobId: "job-123" }, {
      console: output,
      now: () => time,
      operationId: "operation-123",
    });

    diagnostics.started();
    diagnostics.progress({ runId: "run-123", stage: "waiting_for_ai", providerStatus: "queued", pollAttempt: 1 });
    time += 4_000;
    diagnostics.progress({ runId: "run-123", stage: "waiting_for_ai", providerStatus: "queued", pollAttempt: 2 });
    time += 30_000;
    diagnostics.progress({ runId: "run-123", stage: "waiting_for_ai", providerStatus: "queued", pollAttempt: 3 });

    expect(output.info).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(output.info.mock.calls)).not.toContain("prompt");
    expect(JSON.stringify(output.info.mock.calls)).not.toContain("description");
  });

  it("identifies the blocking stage after two minutes", () => {
    let time = 0;
    const output = logger();
    const diagnostics = createAiDiagnostics("evidence-analysis", { jobId: "job-123" }, {
      console: output,
      now: () => time,
      operationId: "operation-123",
    });

    diagnostics.started();
    time = 120_000;
    diagnostics.progress({ runId: "run-123", stage: "waiting_for_ai", providerStatus: "in_progress", pollAttempt: 30 });

    expect(output.warn).toHaveBeenCalledWith("[CV Maker][AI] still waiting", expect.objectContaining({
      blockedAt: "waiting_for_ai",
      providerStatus: "in_progress",
    }));
  });
});
