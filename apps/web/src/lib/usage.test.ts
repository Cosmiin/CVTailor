import { describe, expect, it } from "vitest";
import { formatTokenCount, formatUsdCost } from "./usage";

describe("AI usage formatting", () => {
  it("keeps small model costs visible", () => {
    expect(formatUsdCost(0.004321)).toBe("$0.004321");
    expect(formatUsdCost(1.234)).toBe("$1.23");
    expect(formatUsdCost(null)).toBe("Rate unavailable");
  });

  it("formats token counts without abbreviating audit values", () => {
    expect(formatTokenCount(1234567)).toBe("1,234,567");
  });
});
