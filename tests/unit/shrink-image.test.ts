import { describe, expect, it } from "vitest";
import { fitWithin } from "@/lib/shrink-image";

describe("fitWithin", () => {
  it("scales the long edge down and keeps the proportions", () => {
    expect(fitWithin(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 });
  });
  it("never enlarges", () => {
    expect(fitWithin(1500, 1000, 2560)).toEqual({ width: 1500, height: 1000 });
  });
});
