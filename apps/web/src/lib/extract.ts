import { normalizeText } from "@cv-maker/shared";

export const extractCVText = async (file: File): Promise<string> => {
  if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await pdfjs.getDocument({ data: bytes }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    const text = normalizeText(pages.join("\n\n"), 60_000);
    if (text.length < 40) throw new Error("This PDF has no readable text. Try manual entry; scanned PDFs need OCR.");
    return text;
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  ) {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = normalizeText(result.value, 60_000);
    if (text.length < 40) throw new Error("This DOCX has no readable text. Try manual entry.");
    return text;
  }

  throw new Error("Upload a PDF or DOCX file.");
};
