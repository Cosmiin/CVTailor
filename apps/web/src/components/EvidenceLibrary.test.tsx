import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  demoCV, experienceFingerprint, type ExperienceEnrichment, type ExperienceEvidence,
} from "@cv-maker/shared";
import { EvidenceLibrary } from "./EvidenceLibrary";

const experience = demoCV.experience[0];
const now = "2026-10-21T10:00:00.000Z";
const questions = Array.from({ length: 5 }, (_, index) => ({
  id: `q${index}`,
  prompt: `Question ${index}?`,
  type: "single" as const,
  options: [{ id: `o${index}`, label: "Owned delivery" }, { id: `n${index}`, label: "Not applicable" }],
  rationale: "",
}));
const enrichment: ExperienceEnrichment = {
  experienceId: experience.id,
  createdAt: now,
  updatedAt: now,
  draft: null,
  pending: null,
  active: {
    sourceFingerprint: experienceFingerprint(experience),
    approvedAt: now,
    questions,
    answers: questions.map((question) => ({ questionId: question.id, selectedOptionIds: [question.options[0].id], note: "" })),
    context: {
      schemaVersion: 1,
      overview: "Led cross-functional planning and delivery.",
      responsibilities: ["Owned quarterly planning"],
      methods: ["Iterative planning"],
      tools: ["Analytics dashboards"],
      scope: ["Six teams"],
      domains: ["Product operations"],
      outcomes: ["Clearer decisions"],
      skills: Array.from({ length: 5 }, (_, index) => ({ id: `s${index}`, name: `Skill ${index}`, evidence: "Supported by interview", sourceQuestionIds: [`q${index}`] })),
    },
  },
};
const confirmed: ExperienceEvidence = {
  id: "11111111-1111-4111-8111-111111111111",
  experienceId: experience.id,
  category: "tool",
  label: "Planning tools",
  statement: "Used analytics dashboards to coordinate delivery.",
  searchTerms: ["analytics"],
  sourceQuestionIds: ["q0"],
  sourceJobId: "22222222-2222-4222-8222-222222222222",
  sourceSessionId: "33333333-3333-4333-8333-333333333333",
  roleFingerprint: experienceFingerprint(experience),
  confirmedAt: now,
  createdAt: now,
  updatedAt: now,
};
const noop = () => undefined;

describe("evidence library", () => {
  it("combines interview context and confirmed facts under supporting evidence", () => {
    const html = renderToStaticMarkup(<EvidenceLibrary cv={demoCV} enrichments={{ [experience.id]: enrichment }} evidence={[confirmed]} selectedExperienceId={experience.id} onSelectExperience={noop} onOpenInterview={noop} onConfirmContext={noop} onDeleteContext={noop} onEditEvidence={noop} onDeleteEvidence={noop} />);
    expect(html).toContain("Supporting evidence");
    expect(html).toContain("Led cross-functional planning and delivery.");
    expect(html).toContain("Used analytics dashboards to coordinate delivery.");
    expect(html).toContain("Added through role interview");
    expect(html).toContain("Confirmed while tailoring");
    expect(html).toContain("never appears in the Base CV preview");
  });

  it("marks evidence that no longer matches the role", () => {
    const stale = { ...confirmed, roleFingerprint: "old-role" };
    const html = renderToStaticMarkup(<EvidenceLibrary cv={demoCV} enrichments={{}} evidence={[stale]} selectedExperienceId={experience.id} onSelectExperience={noop} onOpenInterview={noop} onConfirmContext={noop} onDeleteContext={noop} onEditEvidence={noop} onDeleteEvidence={noop} />);
    expect(html).toContain("Needs reconfirmation");
    expect(html).toContain("This role changed after some evidence was confirmed");
  });
});
