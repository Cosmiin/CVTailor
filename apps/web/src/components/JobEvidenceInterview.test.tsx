import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoCV, type JobTailoringSession } from "@cv-maker/shared";
import { JobEvidenceInterview } from "./JobEvidenceInterview";

const now = "2026-10-18T10:00:00.000Z";
const baseSession: JobTailoringSession = {
  schemaVersion: 1,
  id: "11111111-1111-4111-8111-111111111111",
  jobId: "22222222-2222-4222-8222-222222222222",
  status: "ready",
  jobFingerprint: "job-v1",
  baseFingerprint: "cv-v1",
  requirements: [
    { id: "r1", text: "Workflow automation", status: "supported", atsTerms: ["Workflow Automation"], rationale: "Visible in recent delivery work.", sourceRefs: ["base.experience.0"] },
    { id: "r2", text: "Power BI", status: "newly_confirmed", atsTerms: ["Power BI"], rationale: "Confirmed during this interview.", sourceRefs: ["experienceEvidence.e1"] },
    { id: "r3", text: "German language", status: "unsupported", atsTerms: ["German"], rationale: "No candidate evidence.", sourceRefs: [] },
    { id: "r4", text: "People management", status: "unanswered", atsTerms: [], rationale: "The question was skipped.", sourceRefs: [] },
  ],
  questions: [], answers: [], currentIndex: 0, priorEvidence: [], confirmedEvidenceIds: [], reconfirmationDone: true,
  proposedEvidence: [], approvedEvidenceIds: [], createdAt: now, updatedAt: now,
};

const noop = async () => undefined;

describe("job evidence interview", () => {
  it("shows factual coverage without presenting an ATS score", () => {
    const html = renderToStaticMarkup(<JobEvidenceInterview session={baseSession} experiences={demoCV.experience} busy={false} error="" onClose={() => undefined} onSaveAnswer={noop} onReconfirm={noop} onSynthesize={noop} onApprove={noop} onGenerate={noop} onDiscard={noop} />);
    expect(html).toContain("Evidence coverage");
    expect(html).toContain("Confirmed now");
    expect(html).toContain("not a universal ATS score");
    expect(html).toContain("up to 20 relevant approved facts");
  });

  it("asks users to reconfirm reusable evidence before questions", () => {
    const session: JobTailoringSession = { ...baseSession, status: "questions", reconfirmationDone: false, priorEvidence: [{ id: "33333333-3333-4333-8333-333333333333", experienceId: demoCV.experience[0].id, label: "Power BI", statement: "Built operational dashboards.", stale: true }] };
    const html = renderToStaticMarkup(<JobEvidenceInterview session={session} experiences={demoCV.experience} busy={false} error="" onClose={() => undefined} onSaveAnswer={noop} onReconfirm={noop} onSynthesize={noop} onApprove={noop} onGenerate={noop} onDiscard={noop} />);
    expect(html).toContain("Confirm what is still accurate");
    expect(html).toContain("Role changed");
  });

  it("explains that long CV generation continues in the background", () => {
    const html = renderToStaticMarkup(<JobEvidenceInterview session={baseSession} experiences={demoCV.experience} busy generating error="" onClose={() => undefined} onSaveAnswer={noop} onReconfirm={noop} onSynthesize={noop} onApprove={noop} onGenerate={noop} onDiscard={noop} />);
    expect(html).toContain("generating in the background");
    expect(html).toContain("Generating in background");
  });
});
