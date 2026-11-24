import { describe, expect, it } from "vitest";
import { categoryFor, entryFor, heroSettings, missingFiles, parseCatalog, problems, storageProblem, toPosix } from "../../scripts/lib/photo-catalog";

describe("photo catalog", () => {
  it("matches catalog keys on Windows paths", () => {
    expect(toPosix("palasi 3\\a.jpg", "\\")).toBe("palasi 3/a.jpg");
    const c = parseCatalog({ onlyListed: true, photos: { "palasi 3/a.jpg": { category: "pool" } } });
    expect(entryFor(c, toPosix("palasi 3\\a.jpg", "\\"))?.category).toBe("pool");
  });

  it("reads the old flat catalog and falls back to the folder name", () => {
    const c = parseCatalog({ "IMG_1.jpg": { category: "view" } });
    expect(c).toMatchObject({ onlyListed: false, demoOutOfGallery: false, replaceRoomPhotos: [] });
    expect(entryFor(c, "any/IMG_1.jpg")?.category).toBe("view");
    expect(categoryFor("pool/x.jpg", undefined)).toBe("pool");
    expect(categoryFor("palasi2/x.jpg", undefined)).toBe("unsorted");
  });

  it("reports catalog entries without a file, and bad entries", () => {
    const c = parseCatalog({
      onlyListed: true,
      photos: {
        "a.jpg": { slot: "hero", alt: { ka: "ა", en: "a", ru: "а" } },
        "b.jpg": { slot: "hero", alt: { ka: "ბ", en: "b" } },
        "c.jpg": { skip: true },
      },
    });
    expect(missingFiles(c, ["a.jpg"])).toEqual(["b.jpg"]);
    expect(problems(c)).toEqual([expect.stringContaining("b.jpg"), expect.stringContaining("hero")]);
  });

  it("sets hero and CTA explicitly and clears the demo phone hero", () => {
    expect(heroSettings({ heroImageIds: ["old", "oldCta", "x"], heroMobileImageId: "demo", logoUrl: "l" }, { hero: "H", cta: "C", appended: [] }))
      .toEqual({ heroImageIds: ["H", "C"], heroMobileImageId: "", ogImageId: "H", logoUrl: "l" });
    expect(heroSettings({ heroImageIds: ["old"] }, { appended: ["n", "old"] })).toEqual({ heroImageIds: ["old", "n"] });
  });

  it("a re-run with the same hero keeps a phone hero and share image chosen in the admin since", () => {
    const set = { heroImageIds: ["H", "C"], heroMobileImageId: "portrait", ogImageId: "share" };
    expect(heroSettings(set, { hero: "H", cta: "C", appended: [] })).toEqual(set);
  });

  it("refuses a remote database with local photo storage", () => {
    expect(storageProblem("postgresql://u:p@db.example.com:5432/x", undefined)).toMatch(/STORAGE_DRIVER/);
    expect(storageProblem("postgresql://u:p@db.example.com:5432/x", "local")).toMatch(/STORAGE_DRIVER/);
    expect(storageProblem("postgresql://u:p@db.example.com:5432/x", "blob")).toBeNull();
    expect(storageProblem("postgresql://postgres@localhost:54329/royale_hotel", undefined)).toBeNull();
    expect(storageProblem("postgresql://postgres@127.0.0.1/royale_hotel", "local")).toBeNull();
  });
});
