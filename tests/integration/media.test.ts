/**
 * Photo import (scripts/import-images.ts) and photo lookups against the real PostgreSQL test database.
 * The image pipeline is mocked so nothing is written to storage.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

vi.mock("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, revalidateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/lib/media/process", () => ({
  processImage: vi.fn(async (buf: Buffer, name: string, folder: string) => {
    const checksum = createHash("sha256").update(buf).digest("hex");
    return { url: `/media/${folder}/${name}.webp`, avifUrl: `/media/${folder}/${name}.avif`, width: 8, height: 8, blurDataUrl: "", dominantColor: "#000000", checksum };
  }),
}));

import { db } from "@/lib/db";
import { importPhotos } from "../../scripts/import-images";

const alt = { ka: "ფოტო", en: "Photo", ru: "Фото" };
const demo = (category: string, extra: Record<string, unknown> = {}) =>
  db.media.create({ data: { url: `/demo-${Math.random()}.webp`, width: 8, height: 8, category, isDemo: true, ...extra } });

let dir = "";
async function photoFolder() {
  dir = await mkdtemp(join(tmpdir(), "rp-photos-"));
  await mkdir(join(dir, "a"));
  for (const [name, r] of [["one", 200], ["two", 20], ["unlisted", 90]] as const) {
    await writeFile(join(dir, "a", `${name}.jpg`), await sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g: 80, b: 120 } } }).jpeg().toBuffer());
  }
}
async function catalog(photos: Record<string, unknown>) {
  const path = join(dir, `catalog-${Math.random()}.json`);
  await writeFile(path, JSON.stringify({ onlyListed: true, demoOutOfGallery: true, replaceRoomPhotos: ["standard-double"], photos }));
  return path;
}

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "RoomTypePhoto","RoomType","Media","Service","Offer","Setting" CASCADE`);
  await photoFolder();
});
afterAll(() => db.$disconnect());

describe("photo import with a catalog", () => {
  it("fills the slots, detaches demo photos, and can be run again without duplicates", async () => {
    const room = await db.roomType.create({ data: { slug: "standard-double", name: { en: "Standard Double" }, basePrice: 20000, maxAdults: 2, maxOccupancy: 2 } });
    const demoCover = await demo("room");
    await db.roomTypePhoto.create({ data: { roomTypeId: room.id, mediaId: demoCover.id, sortOrder: 0 } });
    await demo("pool", { inGallery: true });
    await db.service.create({ data: { key: "pool", icon: "Waves", title: { en: "Pool" }, description: { en: "" } } });
    await db.offer.create({ data: { slug: "early-summer", title: { en: "Early" }, summary: { en: "" } } });
    await db.setting.create({ data: { key: "media", value: { heroImageIds: ["demoHero"], heroMobileImageId: "demoMobile" } } });

    const opts = {
      dir, sourcePrefix: "real",
      catalogPath: await catalog({
        "a/one.jpg": { name: "room-one", category: "room", alt, gallery: 3, roomType: "standard-double", roomOrder: 0, slot: "hero" },
        "a/two.jpg": { name: "pool-two", category: "pool", alt, gallery: 1, services: ["pool"], offers: ["early-summer"], slot: "cta" },
      }),
    };
    expect(await importPhotos(db, opts)).toMatchObject({ imported: 2, updated: 0, failed: 0 });
    expect(await importPhotos(db, opts)).toMatchObject({ imported: 0, updated: 2, failed: 0 });

    const real = await db.media.findMany({ where: { isDemo: false }, orderBy: { galleryOrder: "asc" } });
    expect(real.map((m) => [m.category, m.inGallery, m.galleryOrder, m.sourceFile])).toEqual([["pool", true, 1, "real/a/two.jpg"], ["room", true, 3, "real/a/one.jpg"]]);
    const [poolPhoto, roomPhoto] = real;
    const links = await db.roomTypePhoto.findMany({ where: { roomTypeId: room.id } });
    expect(links.map((l) => l.mediaId)).toEqual([roomPhoto.id]);
    expect(await db.media.count({ where: { isDemo: true } })).toBe(2); // demo photos are unlinked, never deleted
    expect(await db.media.count({ where: { isDemo: true, inGallery: true } })).toBe(0);
    expect((await db.service.findUniqueOrThrow({ where: { key: "pool" } })).mediaId).toBe(poolPhoto.id);
    expect((await db.offer.findUniqueOrThrow({ where: { slug: "early-summer" } })).mediaId).toBe(poolPhoto.id);
    expect((await db.setting.findUniqueOrThrow({ where: { key: "media" } })).value).toEqual({ heroImageIds: [roomPhoto.id, poolPhoto.id], heroMobileImageId: "", ogImageId: roomPhoto.id });
  });

  it("stops before changing anything when the catalog names a missing file, lacks alt text, or names an unknown room", async () => {
    const run = async (photos: Record<string, unknown>) => importPhotos(db, { dir, sourcePrefix: "real", catalogPath: await catalog(photos) });
    await expect(run({ "a/one.jpg": { category: "room", alt }, "a/gone.jpg": { category: "room", alt } })).rejects.toThrow(/missing/i);
    await expect(run({ "a/one.jpg": { category: "room", alt: { en: "Photo" } } })).rejects.toThrow(/alt text/i);
    await expect(run({ "a/one.jpg": { category: "room", alt, roomType: "no-such-room" } })).rejects.toThrow(/no-such-room/);
    expect(await db.media.count()).toBe(0);
  });
});
