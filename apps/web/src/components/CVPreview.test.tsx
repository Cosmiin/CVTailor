import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoCV } from "@cv-maker/shared";
import { CVPreview } from "./CVPreview";

describe("CVPreview", () => {
  it("renders the semantic CV sections in configured order", () => {
    const html = renderToStaticMarkup(<CVPreview cv={demoCV} />);
    expect(html).toContain("Alex Morgan");
    expect(html.indexOf("Profile")).toBeLessThan(html.indexOf("Experience"));
    expect(html).toContain("Product operations");
  });

  it("marks inferred content for review in the live preview", () => {
    const cv = {
      ...demoCV,
      skills: [{ id: "inferred", text: "Portfolio strategy", visible: true, provenance: { status: "inferred_unconfirmed" as const, sourceRefs: [] } }],
    };
    expect(renderToStaticMarkup(<CVPreview cv={cv} />)).toContain("inferred-preview");
  });
});
