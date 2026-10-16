import { describe, expect, it } from "vitest";
import { squareCropGeometry } from "./photo";

describe("profile photo crop", () => {
  it("makes square photos positionable by applying zoom", () => {
    expect(squareCropGeometry(1000, 1000, 0, 100, 2)).toEqual({
      sourceX: 0,
      sourceY: 500,
      size: 500,
    });
  });

  it("centers a landscape photo and clamps unsafe values", () => {
    expect(squareCropGeometry(1200, 800, 150, -20, 1)).toEqual({
      sourceX: 400,
      sourceY: 0,
      size: 800,
    });
  });
});
