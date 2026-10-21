import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoCV, experienceFingerprint, type ExperienceEvidence } from "@cv-maker/shared";
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

describe("Base CV experience organization", () => {
  it("summarizes supporting evidence without rendering private statements inline", () => {
    const experience = demoCV.experience[0];
    const evidence: ExperienceEvidence = {
      id: "11111111-1111-4111-8111-111111111111", experienceId: experience.id, category: "tool", label: "Planning tools",
      statement: "Private statement that must stay out of the editor.", searchTerms: [], sourceQuestionIds: ["q1"], sourceJobId: null, sourceSessionId: null,
      roleFingerprint: experienceFingerprint(experience), confirmedAt: "2026-10-21T10:00:00.000Z", createdAt: "2026-10-21T10:00:00.000Z", updatedAt: "2026-10-21T10:00:00.000Z",
    };
    const html = renderToStaticMarkup(<CVForm cv={demoCV} onChange={() => undefined} baseMode evidence={[evidence]} onViewEvidence={() => undefined} />);
    expect(html).toContain("1 supporting item");
    expect(html).toContain("View evidence");
    expect(html).not.toContain(evidence.statement);
  });
});
