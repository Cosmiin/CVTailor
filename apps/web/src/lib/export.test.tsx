import { describe, expect, it } from "vitest";
import { createId, demoCV, tailoredCVSchema } from "@cv-maker/shared";
import { buildCVFileName, renderDOCXBlob, renderPDFBlob } from "./export";

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
      text: `R${roleIndex + 1}B${bulletIndex + 1}START Delivered a complex cross-functional initiative with stakeholders across operations, technology, reporting and service delivery while maintaining clear documentation and qualitative outcomes. R${roleIndex + 1}B${bulletIndex + 1}END`,
      visible: true,
      provenance: { status: "verified" as const, sourceRefs: [`experience.${roleIndex}`] },
    })),
  })),
});

const datedCV = tailoredCVSchema.parse({
  ...demoCV,
  jobId: "00000000-0000-4000-8000-000000000002",
  generatedAt: "2026-10-16T12:00:00.000Z",
  contact: { ...demoCV.contact, website: "https://example.com" },
  experience: [{ ...demoCV.experience[0], startDate: "2022-01", endDate: "2023-06" }],
});

const extractPDFPages = async (blob: Blob) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const content = await (await document.getPage(pageNumber)).getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " "));
  }
  return pages;
};

describe("CV export renderers", () => {
  it("builds a safe name-company-role-month-year download filename", () => {
    const cv = { ...datedCV, contact: { ...datedCV.contact, fullName: "Cosmin Marin" } };
    const context = { company: "BAUMIT România & Co.", role: "AI / Automation Specialist", date: new Date("2026-10-16T12:00:00Z") };

    expect(buildCVFileName(cv, context, "pdf")).toBe(
      "Cosmin_Marin_BAUMIT_Romania_and_Co_AI_Automation_Specialist_October_2026.pdf",
    );
    expect(buildCVFileName(cv, context, "docx")).toBe(
      "Cosmin_Marin_BAUMIT_Romania_and_Co_AI_Automation_Specialist_October_2026.docx",
    );
  });

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
    expect((name?.transform[5] ?? 0) - (headline?.transform[5] ?? 0)).toBeGreaterThanOrEqual(14);
  }, 20_000);

  it("keeps the labeled identity block compact and in one reading flow", async () => {
    const blob = await renderPDFBlob(datedCV);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const content = await (await document.getPage(1)).getTextContent();
    const items = content.items.filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && "transform" in item);
    const name = items.find((item) => item.str === datedCV.contact.fullName);
    const profile = items.find((item) => item.str.includes(datedCV.summary.text.slice(0, 20)));
    const labels = ["Email:", "Phone:", "Location:", "LinkedIn:", "Website:"]
      .map((label) => items.find((item) => item.str.trim() === label))
      .filter((item): item is typeof items[number] => Boolean(item));

    expect(name).toBeDefined();
    expect(profile).toBeDefined();
    expect(labels).toHaveLength(5);
    expect((name?.transform[5] ?? 0) - (profile?.transform[5] ?? 0)).toBeLessThan(125);
    expect(Math.max(...labels.map((item) => item.transform[5])) - Math.min(...labels.map((item) => item.transform[5]))).toBeLessThan(20);
  }, 20_000);

  it("renders long experience content to PDF without stalling", async () => {
    const blob = await renderPDFBlob(longCV);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1_000);

    const pages = await extractPDFPages(blob);
    expect(pages.length).toBeGreaterThan(1);
    pages.slice(1).forEach((page, index) => {
      expect(page).toContain("Alex Morgan");
      expect(page).toContain("CV continuation");
      expect(page).toContain(`Page ${index + 2}`);
    });
    Array.from({ length: 7 }, (_, roleIndex) => Array.from({ length: 6 }, (_, bulletIndex) => {
      const start = `R${roleIndex + 1}B${bulletIndex + 1}START`;
      const end = `R${roleIndex + 1}B${bulletIndex + 1}END`;
      expect(pages.findIndex((page) => page.includes(start))).toBe(pages.findIndex((page) => page.includes(end)));
    }));
    Array.from({ length: 7 }, (_, roleIndex) => {
      expect(pages.findIndex((page) => page.includes(`Role ${roleIndex + 1}`))).toBe(pages.findIndex((page) => page.includes(`R${roleIndex + 1}B1START`)));
    });
  }, 20_000);

  it("renders the same accepted content to DOCX", async () => {
    const blob = await renderDOCXBlob(longCV);
    expect(blob.type).toContain("wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(1_000);
  }, 20_000);

  it("includes each role tenure in PDF and DOCX exports", async () => {
    const pdfBlob = await renderPDFBlob(datedCV);
    const pdfText = (await extractPDFPages(pdfBlob))[0];

    const docxBlob = await renderDOCXBlob(datedCV);
    const mammoth = await import("mammoth/mammoth.browser");
    const docxText = (await mammoth.extractRawText({ arrayBuffer: await docxBlob.arrayBuffer() })).value.replace(/\s+/g, " ");

    expect(pdfText).toContain("1 year 6 months");
    expect(docxText).toContain("1 year 6 months");
    ["Email:", "Phone:", "Location:", "LinkedIn:", "Website:"].forEach((label) => {
      expect(pdfText).toContain(label);
      expect(docxText).toContain(label);
    });
  }, 20_000);
});
