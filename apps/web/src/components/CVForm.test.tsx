import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoCV } from "@cv-maker/shared";
import { CVForm } from "./CVForm";

const cv = {
  ...demoCV,
  photo: { dataUrl: "data:image/jpeg;base64,YQ==", fileName: "profile.jpg", visible: true, positionX: 31, positionY: 62, zoom: 1.4 },
};

describe("global profile photo preference", () => {
  it("allows positioning only from the Base CV and explains that it is saved globally", () => {
    const html = renderToStaticMarkup(<CVForm cv={cv} onChange={() => undefined} baseMode onPhotoCommit={() => undefined} />);
    expect(html).toContain("Drag to center");
    expect(html).toContain("Position saved automatically");
    expect(html).toContain("automatically reused in every tailored CV and export");
  });

  it("shows the saved crop as read-only in tailored CVs", () => {
    const html = renderToStaticMarkup(<CVForm cv={cv} onChange={() => undefined} />);
    expect(html).toContain("managed in your Base CV");
    expect(html).toContain("Adjust in Base CV");
    expect(html).not.toContain("Drag to center");
  });
});
