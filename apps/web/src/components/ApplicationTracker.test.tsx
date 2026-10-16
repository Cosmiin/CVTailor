import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoCV, tailoredCVSchema } from "@cv-maker/shared";
import { ApplicationTracker, applicationStatusLabel } from "./ApplicationTracker";
import type { JobRecord } from "../lib/data";

const cv = tailoredCVSchema.parse({ ...demoCV, jobId: "00000000-0000-4000-8000-000000000004", generatedAt: "2026-10-16T12:00:00.000Z" });
const job: JobRecord = {
  schemaVersion: 2, id: "00000000-0000-4000-8000-000000000004", url: "https://example.com/job", title: "Product Lead", company: "Acme",
  description: "A sufficiently detailed job description for the application tracker test.", captureMethod: "url", parseStatus: "completed", parseWarnings: [],
  structuredData: null, location: "Remote", datePosted: null, employmentType: null, seniority: null, sourceLanguage: null,
  latestTailoredCV: cv, applicationStatus: "applied", appliedAt: "2026-10-10T12:00:00.000Z", applicationStatusChangedAt: "2026-10-11T12:00:00.000Z",
  appliedCV: cv, templateId: "clarity", createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-11T12:00:00.000Z",
};

describe("ApplicationTracker", () => {
  it("shows the current stage, application date, status date, and saved CV", () => {
    const html = renderToStaticMarkup(<ApplicationTracker job={job} cv={cv} onChange={() => undefined} />);
    expect(html).toContain("Awaiting response");
    expect(html).toContain("10 Oct 2026");
    expect(html).toContain("11 Oct 2026");
    expect(html).toContain("CV used");
    expect(html).toContain("Saved");
  });

  it("uses clear labels for every selectable stage", () => {
    expect(applicationStatusLabel("not_applied")).toBe("Not applied");
    expect(applicationStatusLabel("response_received")).toBe("Response received");
    expect(applicationStatusLabel("interviewing")).toBe("Interviewing");
    expect(applicationStatusLabel("offer")).toBe("Offer received");
  });
});
