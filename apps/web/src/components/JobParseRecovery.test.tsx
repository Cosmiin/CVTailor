import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobRecord } from "../lib/data";
import { JobParseRecovery } from "./JobParseRecovery";

const job: JobRecord = {
  schemaVersion: 2,
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://example.com/job",
  title: "Solutions Architect",
  company: "Example Ltd",
  description: "A complete saved job description with responsibilities, requirements, tools, and enough detail for manual recovery after parsing fails.",
  captureMethod: "url",
  capturedAt: "2026-10-19T10:00:00.000Z",
  structuredData: null,
  parseStatus: "failed",
  parseWarnings: ["openai_timeout"],
  location: "",
  datePosted: null,
  employmentType: null,
  seniority: null,
  sourceLanguage: null,
  latestTailoredCV: null,
  applicationStatus: "not_applied",
  appliedAt: null,
  applicationStatusChangedAt: null,
  appliedCV: null,
  templateId: "clarity",
  createdAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-19T10:00:00.000Z",
};

const noop = async () => undefined;

describe("job parse recovery", () => {
  it("offers automatic retry and manual recovery", () => {
    const html = renderToStaticMarkup(<JobParseRecovery job={job} busy={false} onRetry={noop} onSaveManual={noop} />);
    expect(html).toContain("Retry automatically");
    expect(html).toContain("Add manually");
    expect(html).toContain("Your original capture is safe");
  });

  it("keeps role, company, and full description as separate manual fields", () => {
    const html = renderToStaticMarkup(<JobParseRecovery job={job} busy={false} onRetry={noop} onSaveManual={noop} initiallyOpen />);
    expect(html).toContain("Role title");
    expect(html).toContain("Company name");
    expect(html).toContain("Full job description");
    expect(html).toContain("Solutions Architect");
    expect(html).toContain("Example Ltd");
  });
});
