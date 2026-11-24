import { describe, expect, it } from "vitest";
import { preferReal } from "@/lib/prefer-real";

const img = (url: string, isDemo: boolean) => ({ url, isDemo });

describe("preferReal", () => {
  it("takes the first real photo, even when a demo one comes earlier", () => {
    expect(preferReal(img("stock-lobby", true), img("real-facade", false))?.url).toBe("real-facade");
    expect(preferReal(img("real-a", false), img("real-b", false))?.url).toBe("real-a");
  });
  it("falls back to the first photo there is when none is real", () => {
    expect(preferReal(undefined, img("stock-a", true), img("stock-b", true))?.url).toBe("stock-a");
    expect(preferReal(undefined, undefined)).toBeUndefined();
  });
});
