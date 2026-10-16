import { describe, expect, it } from "vitest";
import type { ApplicationStatus } from "@cv-maker/shared";
import type { JobRecord } from "../lib/data";
import { applicationCounts, encouragementMessages, filterApplications } from "./ApplicationsPage";

const job = (id: string, company: string, title: string, applicationStatus: ApplicationStatus): JobRecord => ({
  schemaVersion: 2,
  id,
  url: "https://example.com/job",
  title,
  company,
  description: "A complete job description with enough detail to be treated as a valid saved job record.",
  captureMethod: "paste",
  capturedAt: "2026-10-16T12:00:00.000Z",
  structuredData: null,
  parseStatus: "completed",
  parseWarnings: [],
  location: "Bucharest",
  datePosted: null,
  employmentType: null,
  seniority: null,
  sourceLanguage: "en",
  latestTailoredCV: null,
  applicationStatus,
  appliedAt: applicationStatus === "not_applied" ? null : "2026-10-16T12:00:00.000Z",
  applicationStatusChangedAt: "2026-10-16T12:00:00.000Z",
  appliedCV: null,
  templateId: "clarity",
  createdAt: "2026-10-16T12:00:00.000Z",
  updatedAt: "2026-10-16T12:00:00.000Z",
});

const jobs = [
  job("00000000-0000-4000-8000-000000000001", "Acme Systems", "Automation Lead", "applied"),
  job("00000000-0000-4000-8000-000000000002", "Northstar", "Solutions Architect", "interviewing"),
  job("00000000-0000-4000-8000-000000000003", "Bright Labs", "Product Manager", "offer"),
  job("00000000-0000-4000-8000-000000000004", "Future Works", "Business Analyst", "not_applied"),
];

describe("applications dashboard", () => {
  it("searches company and role text and filters by status", () => {
    expect(filterApplications(jobs, "acme", "all").map((item) => item.title)).toEqual(["Automation Lead"]);
    expect(filterApplications(jobs, "architect", "all").map((item) => item.company)).toEqual(["Northstar"]);
    expect(filterApplications(jobs, "", "offer").map((item) => item.company)).toEqual(["Bright Labs"]);
  });

  it("counts applied jobs and pipeline stages", () => {
    expect(applicationCounts(jobs)).toEqual({ applied: 3, waiting: 1, active: 1, offers: 1 });
    expect(encouragementMessages.length).toBeGreaterThanOrEqual(5);
    expect(encouragementMessages.length).toBeLessThanOrEqual(10);
  });
});

