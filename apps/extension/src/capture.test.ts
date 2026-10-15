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
});
