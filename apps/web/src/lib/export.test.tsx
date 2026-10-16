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

const datedCV = tailoredCVSchema.parse({
  ...demoCV,
  jobId: "00000000-0000-4000-8000-000000000002",
  generatedAt: "2026-10-16T12:00:00.000Z",
  experience: [{ ...demoCV.experience[0], startDate: "2022-01", endDate: "2023-06" }],
});

describe("CV export renderers", () => {
  it("keeps the headline below the candidate name in the PDF header", async () => {
    const blob = await renderPDFBlob(longCV);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const content = await (await document.getPage(1)).getTextContent();
    const items = content.items.filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && "transform" in item);
    const name = items.find((item) => item.str === longCV.contact.fullName);
    const headline = items.find((item) => item.str === longCV.contact.headline);

    expect(name).toBeDefined();
    expect(headline).toBeDefined();
    expect((name?.transform[5] ?? 0) - (headline?.transform[5] ?? 0)).toBeGreaterThanOrEqual(16);
  }, 20_000);

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

  it("includes each role tenure in PDF and DOCX exports", async () => {
    const pdfBlob = await renderPDFBlob(datedCV);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()) }).promise;
    const pdfContent = await (await pdfDocument.getPage(1)).getTextContent();
    const pdfText = pdfContent.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");

    const docxBlob = await renderDOCXBlob(datedCV);
    const mammoth = await import("mammoth/mammoth.browser");
    const docxText = (await mammoth.extractRawText({ arrayBuffer: await docxBlob.arrayBuffer() })).value.replace(/\s+/g, " ");

    expect(pdfText).toContain("1 year 6 months");
    expect(docxText).toContain("1 year 6 months");
  }, 20_000);
});
