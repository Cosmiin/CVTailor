// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractVisibleJob } from "./capture";

describe("job capture", () => {
  it("extracts a semantic job listing and normalizes its text", () => {
    document.title = "Fallback title";
    document.body.innerHTML = `<h1>Senior Product Manager</h1><div class="company-name">Acme</div><article itemprop="description">Lead product strategy, customer discovery, experiments, planning, delivery and cross-functional stakeholder alignment for a growing software platform with measurable outcomes.</article>`;
    const result = extractVisibleJob();
    expect(result.title).toBe("Senior Product Manager");
    expect(result.company).toBe("Acme");
    expect(result.description).toContain("cross-functional stakeholder alignment");
  });

  it("prefers the job description and carries JobPosting metadata without capturing recommendations", () => {
    document.documentElement.lang = "ro";
    document.title = "Specialist Digitalizare | BestJobs";
    document.body.innerHTML = `
      <script type="application/ld+json">{"@type":"JobPosting","title":"Specialist Digitalizare","datePosted":"2026-10-01"}</script>
      <h1>Specialist Digitalizare</h1><div class="company-name">BAUMIT COM</div>
      <section class="job-description">Responsabilități principale: Analizează procesele de business și identifică oportunități de digitalizare. Cerințe: experiență în implementarea proiectelor de digitalizare și abilități de comunicare.</section>
      <aside>Similar jobs Digital Implementation Consultant ERP Specialist Project Manager</aside>`;
    const result = extractVisibleJob();
    expect(result.description).toContain("Responsabilități principale");
    expect(result.description).not.toContain("Similar jobs");
    expect(result.sourceLanguage).toBe("ro");
    expect(result.structuredMetadata).toEqual([expect.objectContaining({ "@type": "JobPosting" })]);
  });
});
