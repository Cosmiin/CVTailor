import { describe, expect, it } from "vitest";
import { createId, demoCV, tailoredCVSchema } from "@cv-maker/shared";
import { renderDOCXBlob, renderPDFBlob } from "./export";

const longCV = tailoredCVSchema.parse({
  ...demoCV,
  jobId: "a04ee774-3fea-4aac-a2b3-30b9a23218f5",
  templateId: "clarity",
  generatedAt: "2026-10-16T12:00:00.000Z",
  experience: Array.from({ length: 7 }, (_, roleIndex) => ({
    ...demoCV.experience[0],
    id: `role-${roleIndex}`,
    role: `Role ${roleIndex + 1}`,
    bullets: Array.from({ length: 6 }, (_, bulletIndex) => ({
      id: createId("bullet"),
      text: `Delivered a complex cross-functional initiative ${bulletIndex + 1} with stakeholders across operations, technology, reporting and service delivery while maintaining clear documentation and qualitative outcomes.`,
      visible: true,
      provenance: { status: "verified" as const, sourceRefs: [`experience.${roleIndex}`] },
    })),
  })),
});

describe("CV export renderers", () => {
  it("renders long experience content to PDF without stalling", async () => {
    const blob = await renderPDFBlob(longCV);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1_000);
  }, 20_000);

  it("renders the same accepted content to DOCX", async () => {
    const blob = await renderDOCXBlob(longCV);
    expect(blob.type).toContain("wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(1_000);
  }, 20_000);
});
