import { describe, expect, it } from "vitest";
import {
  calculateExperienceMonths, demoCV, exportableCV, formatExperienceDate, formatExperienceDuration,
  hasUnconfirmedClaims, jobStructuredDataSchema, normalizeText,
} from "./index";

describe("shared CV rules", () => {
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
    const cv = { ...demoCV, photo: { dataUrl: "data:image/jpeg;base64,YQ==", fileName: "me.jpg", visible: true, positionX: 35, positionY: 60 } };
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
      languages: [{ name: "Română", level: "nativ" }, { name: "Engleză", level: "avansat" }],
      benefits: ["Traininguri și cursuri de specializare"],
      cleanDescription: "Specialist Digitalizare la BAUMIT COM în București.",
      sourceLanguage: "ro",
      warnings: ["Data publicării nu apare în anunț."],
    });
    expect(job.datePosted).toBeNull();
    expect(job.title).toBe("Specialist Digitalizare");
    expect(job.responsibilities[0]).toContain("Analizează");
  });
});
