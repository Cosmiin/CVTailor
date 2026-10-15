import { describe, expect, it } from "vitest";
import { demoCV, exportableCV, hasUnconfirmedClaims, jobStructuredDataSchema, normalizeText } from "./index";

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
    const cv = { ...demoCV, photo: { dataUrl: "data:image/jpeg;base64,YQ==", fileName: "me.jpg", visible: true } };
    expect(exportableCV(cv).photo?.dataUrl).toBe(cv.photo.dataUrl);
    expect(hasUnconfirmedClaims(cv)).toBe(false);
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
