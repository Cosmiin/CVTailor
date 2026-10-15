import { describe, expect, it } from "vitest";
import { demoCV, exportableCV, hasUnconfirmedClaims, normalizeText } from "./index";

describe("shared CV rules", () => {
  it("normalizes untrusted text", () => {
    expect(normalizeText(" hello\u0000   world\r\n\r\n\r\nnext ")).toBe("hello world\n\nnext");
  });

  it("excludes unconfirmed inferred claims from export", () => {
    const cv = {
      ...demoCV,
      skills: [
        ...demoCV.skills,
        {
          id: "inferred",
          text: "Enterprise strategy",
          visible: true,
          provenance: { status: "inferred_unconfirmed" as const, sourceRefs: [] },
        },
      ],
    };
    expect(hasUnconfirmedClaims(cv)).toBe(true);
    expect(exportableCV(cv).skills.some((skill) => skill.id === "inferred")).toBe(false);
  });
});
