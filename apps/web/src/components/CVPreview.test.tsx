import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoCV } from "@cv-maker/shared";
import { CVPreview } from "./CVPreview";

describe("CVPreview", () => {
  it("renders the semantic CV sections in configured order", () => {
    const cv = { ...demoCV, contact: { ...demoCV.contact, website: "https://example.com" }, experience: demoCV.experience.map((item, index) => index ? item : { ...item, startDate: "2022-01", endDate: "2023-06" }) };
    const html = renderToStaticMarkup(<CVPreview cv={cv} />);
    expect(html).toContain("Alex Morgan");
    expect(html.indexOf("<h2>Profile</h2>")).toBeLessThan(html.indexOf("<h2>Experience</h2>"));
    expect(html).toContain("Product operations");
    expect(html).toContain("1 year 6 months");
    expect(html).toContain("Email:");
    expect(html).toContain("Phone:");
    expect(html).toContain("Location:");
    expect(html).toContain("LinkedIn:");
    expect(html).toContain("Website:");
    expect(html).toContain("resume-contact-line");
    expect(html).toContain("resume-skills-text");
  });

  it("marks inferred content for review in the live preview", () => {
    const cv = {
      ...demoCV,
      skills: [{ id: "inferred", text: "Portfolio strategy", visible: true, provenance: { status: "inferred_unconfirmed" as const, sourceRefs: [] } }],
    };
    expect(renderToStaticMarkup(<CVPreview cv={cv} />)).toContain("inferred-preview");
  });

  it("renders the reusable profile photo when enabled", () => {
    const cv = { ...demoCV, photo: { dataUrl: "data:image/jpeg;base64,YQ==", fileName: "me.jpg", visible: true, positionX: 25, positionY: 70, zoom: 1.3 } };
    const html = renderToStaticMarkup(<CVPreview cv={cv} />);
    expect(html).toContain("resume-photo");
    expect(html).toContain("resume-identity has-photo");
    expect(html).toContain("Alex Morgan profile");
    expect(html).toContain("object-position:25% 70%");
    expect(html).toContain("scale(1.3)");
    expect(html).toContain("<strong>Experience:</strong>");
  });
});
