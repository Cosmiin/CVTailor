import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoCV, experienceFingerprint, type ExperienceEnrichment } from "@cv-maker/shared";
import { ExperienceContextPanel } from "./ExperienceInterview";
import { CVPreview } from "./CVPreview";

const experience = demoCV.experience[0];
const now = new Date("2026-10-16T10:00:00.000Z").toISOString();
const questions = Array.from({ length: 5 }, (_, index) => ({
  id: `q${index + 1}`, prompt: `Question ${index + 1}?`, type: "single" as const,
  options: [{ id: `q${index + 1}-o1`, label: "Owned delivery" }, { id: `q${index + 1}-o2`, label: "Not applicable" }], rationale: "",
}));
const record: ExperienceEnrichment = {
  experienceId: experience.id, createdAt: now, updatedAt: now, draft: null, pending: null,
  active: {
    sourceFingerprint: experienceFingerprint(experience), approvedAt: now, questions,
    answers: questions.map((question) => ({ questionId: question.id, selectedOptionIds: [question.options[0].id], note: "" })),
    context: {
      schemaVersion: 1, overview: "Led AI-assisted delivery across teams.", responsibilities: ["Owned delivery"],
      methods: ["Iterative planning"], tools: ["AI workflows"], scope: ["Cross-functional"], domains: ["Operations"], outcomes: ["Clearer decisions"],
      skills: ["Agentic Development", "Process Design", "Team Leadership", "AI Workflows", "Delivery Strategy"].map((name, index) => ({ id: `s${index}`, name, evidence: "Confirmed by the interview.", sourceQuestionIds: [questions[index].id] })),
    },
  },
};

describe("experience context UI", () => {
  it("shows approved context in the editor panel", () => {
    const html = renderToStaticMarkup(<ExperienceContextPanel experience={experience} record={record} onOpen={() => undefined} onConfirm={() => undefined} onDelete={() => undefined} />);
    expect(html).toContain("Confirmed evidence");
    expect(html).toContain("Agentic Development");
    expect(html).toContain("Interview answers");
  });

  it("marks context stale after the role changes", () => {
    const html = renderToStaticMarkup(<ExperienceContextPanel experience={{ ...experience, role: `${experience.role} II` }} record={record} onOpen={() => undefined} onConfirm={() => undefined} onDelete={() => undefined} />);
    expect(html).toContain("Potentially outdated");
    expect(html).toContain("Still accurate");
  });

  it("does not leak private context into the base CV preview", () => {
    const html = renderToStaticMarkup(<CVPreview cv={demoCV} />);
    expect(html).not.toContain("Agentic Development");
    expect(html).not.toContain("AI-assisted delivery across teams");
  });
});
