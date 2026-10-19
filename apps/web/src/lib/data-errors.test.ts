// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { friendlyFunctionErrorCode } from "./data";

describe("Edge Function error messages", () => {
  it("turns transport failures into a resumable explanation", () => {
    expect(friendlyFunctionErrorCode("Failed to send a request to the Edge Function")).toContain("background work is safe");
  });

  it("explains the three-operation account limit", () => {
    expect(friendlyFunctionErrorCode("ai_concurrency_limit")).toContain("Three AI operations");
  });

  it("keeps temporary provider overload actionable", () => {
    expect(friendlyFunctionErrorCode("openai_server_is_overloaded")).toContain("resume");
  });
});
