import { describe, expect, it } from "vitest";
import { budgetEvidenceItems, selectRelevantExperienceEvidence } from "../../../supabase/functions/_shared/evidence-ranking";
import {
  aiUsageRecordSchema, applicationStatusSchema, calculateExperienceMonths, calculateRoleExperienceMonths, demoCV, experienceContextSchema, experienceEnrichmentSchema, experienceFingerprint, experienceInterviewDraftSchema,
  experienceEvidenceSchema, exportableCV, formatExperienceDate, formatExperienceDuration, hasUnconfirmedClaims,
  jobInterviewAnswerSchema, jobTailoringSessionSchema, jobStructuredDataSchema, normalizeText,
} from "./index";

describe("shared CV rules", () => {
  it("validates forward-only AI usage metadata", () => {
    const usage = aiUsageRecordSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      purpose: "cv_tailoring",
      model: "gpt-6.1-sol",
      inputTokens: 4200,
      outputTokens: 950,
      totalTokens: 5150,
      costUsd: 0.0179,
      createdAt: "2026-10-20T10:00:00.000Z",
    });
    expect(usage.cachedInputTokens).toBe(0);
    expect(usage.totalTokens).toBe(5150);
  });

  it("validates skippable job interviews and caps them at eight questions", () => {
    const now = new Date().toISOString();
    const question = { id: "q1", targetExperienceId: "role-1", requirementIds: ["r1"], prompt: "Which tool did you use?", type: "free_text" as const, options: [], rationale: "Clarifies a required tool." };
    const base = { schemaVersion: 1 as const, id: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222", status: "questions" as const, jobFingerprint: "job", baseFingerprint: "base", requirements: [1, 2, 3, 4].map((index) => ({ id: `r${index}`, text: `Requirement ${index}`, status: "unclear" as const, atsTerms: [], rationale: "Needs evidence." })), questions: Array.from({ length: 8 }, (_, index) => ({ ...question, id: `q${index + 1}` })), answers: [], currentIndex: 0, priorEvidence: [], confirmedEvidenceIds: [], reconfirmationDone: true, proposedEvidence: [], approvedEvidenceIds: [], createdAt: now, updatedAt: now };
    expect(jobTailoringSessionSchema.parse(base).questions).toHaveLength(8);
    expect(jobTailoringSessionSchema.safeParse({ ...base, questions: [...base.questions, { ...question, id: "q9" }] }).success).toBe(false);
    expect(jobInterviewAnswerSchema.parse({ questionId: "q1", skipped: true }).skipped).toBe(true);
  });

  it("limits reusable evidence statements and keeps audit references", () => {
    const now = new Date().toISOString();
    const valid = { id: "33333333-3333-4333-8333-333333333333", experienceId: "role-1", category: "tool" as const, label: "Power BI", statement: "Built and maintained operational dashboards in Power BI.", searchTerms: ["Power BI", "business intelligence"], sourceQuestionIds: ["q2"], sourceJobId: "22222222-2222-4222-8222-222222222222", sourceSessionId: "11111111-1111-4111-8111-111111111111", roleFingerprint: "v1-role", confirmedAt: now, createdAt: now, updatedAt: now };
    expect(experienceEvidenceSchema.parse(valid).sourceQuestionIds).toEqual(["q2"]);
    expect(experienceEvidenceSchema.safeParse({ ...valid, statement: "x".repeat(301) }).success).toBe(false);
  });

  it("shortlists 200 historical facts without replaying their raw answers", () => {
    const roles = new Map(Array.from({ length: 5 }, (_, index) => [`role-${index + 1}`, { id: `role-${index + 1}`, role: "Operations Lead" }]));
    const history = Array.from({ length: 200 }, (_, index) => ({
      id: `e-${index}`, experience_id: `role-${(index % 5) + 1}`, label: index < 50 ? "Power BI" : "Unrelated",
      statement: index < 50 ? `Built Power BI dashboard ${index}.` : `Historical answer ${index}.`,
      search_terms: index < 50 ? ["Power BI", "business intelligence"] : ["unrelated"],
      role_fingerprint: "current", updated_at: new Date(2026, 0, (index % 28) + 1).toISOString(),
    }));
    const selected = selectRelevantExperienceEvidence(history, roles, { title: "Power BI Operations Lead", requirements: ["Business intelligence dashboards"] }, () => "current");
    expect(selected.length).toBeLessThanOrEqual(20);
    for (const roleId of roles.keys()) expect(selected.filter((item) => item.item.experience_id === roleId).length).toBeLessThanOrEqual(6);
    const compact = budgetEvidenceItems(selected.map(({ item }) => ({ id: item.id, statement: item.statement, searchTerms: item.search_terms })), 6000);
    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(6000);
    expect(JSON.stringify(compact)).not.toContain("rawQuestion");
  });

  it("accepts only supported application stages", () => {
    expect(applicationStatusSchema.parse("interviewing")).toBe("interviewing");
    expect(applicationStatusSchema.safeParse("ghosted").success).toBe(false);
  });

  it("normalizes untrusted text", () => {
    expect(normalizeText(" hello\u0000   world\r\n\r\n\r\nnext ")).toBe("hello world\n\nnext");
  });

  it("excludes unconfirmed inferred claims from export", () => {
    const cv = {
      ...demoCV,
      skills: [
        ...demoCV.skills,
        {
          id: "inferred",
          text: "Enterprise strategy",
          visible: true,
          provenance: { status: "inferred_unconfirmed" as const, sourceRefs: [] },
        },
      ],
    };
    expect(hasUnconfirmedClaims(cv)).toBe(true);
    expect(exportableCV(cv).skills.some((skill) => skill.id === "inferred")).toBe(false);
  });

  it("preserves a user photo without treating it as an inferred claim", () => {
    const cv = { ...demoCV, photo: { dataUrl: "data:image/jpeg;base64,YQ==", fileName: "me.jpg", visible: true, positionX: 35, positionY: 60, zoom: 1.25 } };
    expect(exportableCV(cv).photo?.dataUrl).toBe(cv.photo.dataUrl);
    expect(hasUnconfirmedClaims(cv)).toBe(false);
  });

  it("calculates unique employment months and formats month values", () => {
    const cv = {
      ...demoCV,
      experience: [
        { ...demoCV.experience[0], startDate: "2022-01", endDate: "2022-12" },
        { ...demoCV.experience[1], startDate: "Jul 2022", endDate: "2023-06" },
      ],
    };
    expect(calculateExperienceMonths(cv, new Date("2026-10-15"))).toBe(18);
    expect(calculateRoleExperienceMonths(cv.experience[0], new Date("2026-10-15"))).toBe(12);
    expect(calculateRoleExperienceMonths({ startDate: "2022-12", endDate: "Present" }, new Date("2026-10-15"))).toBe(47);
    expect(formatExperienceDuration(18)).toBe("1 year 6 months");
    expect(formatExperienceDate("2022-07")).toBe("Jul 2022");
  });

  it("validates an original-language structured job without inventing a posting date", () => {
    const job = jobStructuredDataSchema.parse({
      schemaVersion: 2,
      title: "Specialist Digitalizare",
      company: { displayName: "BAUMIT COM", legalName: "BAUMIT ROMANIA", description: null },
      location: { original: "București, România", city: "București", country: "România", remotePolicy: "onsite" },
      datePosted: null,
      validThrough: null,
      employmentType: null,
      seniority: null,
      compensation: { minimum: 1800, maximum: 2000, currency: "EUR", period: "month", estimated: false },
      summary: "Contribuie la digitalizarea companiei.",
      responsibilities: ["Analizează procesele de business."],
      requirements: {
        required: ["Experiență în proiecte de digitalizare"], preferred: [],
        skills: ["Comunicare"], experience: [], education: [],
      },
      atsKeywords: ["Digitalizare", "Analiză procese", "Project management", "Comunicare", "Automatizare"],
      languages: [{ name: "Română", level: "nativ" }, { name: "Engleză", level: "avansat" }],
      benefits: ["Traininguri și cursuri de specializare"],
      cleanDescription: "Specialist Digitalizare la BAUMIT COM în București.",
      sourceLanguage: "ro",
      warnings: ["Data publicării nu apare în anunț."],
    });
    expect(job.datePosted).toBeNull();
    expect(job.title).toBe("Specialist Digitalizare");
    expect(job.responsibilities[0]).toContain("Analizează");
    expect(job.atsKeywords).toContain("Digitalizare");
  });

  it("validates a resumable interview and supported context skills", () => {
    const now = new Date().toISOString();
    const questions = Array.from({ length: 5 }, (_, index) => ({
      id: `q${index + 1}`, prompt: `Question ${index + 1}?`, type: "single" as const,
      options: [{ id: "yes", label: "Yes" }, { id: "na", label: "Not applicable" }], rationale: "",
    }));
    expect(experienceInterviewDraftSchema.parse({
      schemaVersion: 1, sourceFingerprint: "v1-test", questions, answers: [], currentIndex: 0, startedAt: now, updatedAt: now,
    }).questions).toHaveLength(5);
    expect(experienceContextSchema.safeParse({
      schemaVersion: 1, overview: "Led a product operations function.", responsibilities: [], methods: [], tools: [], scope: [], domains: [], outcomes: [],
      skills: Array.from({ length: 5 }, (_, index) => ({ id: `s${index}`, name: index ? `Skill ${index}` : "Agentic Development", evidence: "Confirmed in the interview.", sourceQuestionIds: ["q1"] })),
    }).success).toBe(true);
  });

  it("accepts Supabase timestamps with UTC offsets for enrichment records", () => {
    expect(experienceEnrichmentSchema.safeParse({
      experienceId: "experience-1",
      active: null,
      draft: null,
      pending: null,
      createdAt: "2026-10-16T10:28:00+00:00",
      updatedAt: "2026-10-16T12:35:42.123456+00:00",
    }).success).toBe(true);
  });

  it("fingerprints experience content and rejects four-word skills", () => {
    const first = experienceFingerprint(demoCV.experience[0]);
    expect(experienceFingerprint({ ...demoCV.experience[0], role: `${demoCV.experience[0].role} II` })).not.toBe(first);
    expect(experienceContextSchema.safeParse({
      schemaVersion: 1, overview: "Overview", responsibilities: [], methods: [], tools: [], scope: [], domains: [], outcomes: [],
      skills: Array.from({ length: 5 }, (_, index) => ({ id: `s${index}`, name: index ? `Skill ${index}` : "One two three four", evidence: "Evidence", sourceQuestionIds: ["q1"] })),
    }).success).toBe(false);
  });
});
