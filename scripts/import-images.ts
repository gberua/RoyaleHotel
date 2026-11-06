/**
 * npm run images
 *
 * Imports every photo in assets/google-maps/ (sub-folders allowed) into the media library:
 * auto-rotate, strip EXIF/GPS, resize, WebP + AVIF masters and a blur placeholder, then a
 * Media row you can assign to rooms / gallery / hero from the admin panel.
 *
 * Safe to re-run: files already imported (same content hash) are skipped.
 *
 * Optional, to sort and name in bulk: assets/google-maps/catalog.json
 * {
 *   "IMG_1234.jpg": {
 *     "name": "deluxe-sea-view-balcony",          // descriptive file name
 *     "category": "room",                         // exterior | lobby | room | restaurant | pool | beach | view | kobuleti
 *     "alt": { "ka": "...", "en": "...", "ru": "..." },
 *     "roomType": "deluxe-sea-view",               // attach to this room type (slug)
 *     "gallery": true,                             // show on /gallery
 *     "hero": true,                                // add to the home page hero
 *     "skip": false                                // e.g. photos that still show the old hotel name
 *   }
 * }
 * Without a catalog, a sub-folder name that matches a category is used (assets/google-maps/pool/…).
 */
import "dotenv/config";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname, join, relative } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { processImage } from "../src/lib/media/process";

const ROOT = join(process.cwd(), "assets", "google-maps");
const CATEGORIES = ["exterior", "lobby", "room", "restaurant", "pool", "beach", "view", "kobuleti"];
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);

type Entry = { name?: string; category?: string; alt?: Record<string, string>; roomType?: string; gallery?: boolean; hero?: boolean; skip?: boolean };

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

async function main() {
  const catalog: Record<string, Entry> = JSON.parse(await readFile(join(ROOT, "catalog.json"), "utf8").catch(() => "{}"));
  const files = await walk(ROOT);
  if (!files.length) {
    console.log(`No photos found in ${relative(process.cwd(), ROOT)}/ — drop the Google Maps photos there and run again.`);
    return;
  }
  const settings = await db.setting.findUnique({ where: { key: "media" } });
  const media = (settings?.value ?? {}) as { heroImageIds?: string[] };
  const heroIds = new Set(media.heroImageIds ?? []);
  let imported = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const rel = relative(ROOT, file);
    const entry = catalog[rel] ?? catalog[basename(file)] ?? {};
    if (entry.skip) { skipped++; console.log(`  skip (catalog)  ${rel}`); continue; }
    const buf = await readFile(file);
    const checksum = createHash("sha256").update(buf).digest("hex");
    const existing = await db.media.findUnique({ where: { checksum } });
    if (existing) { skipped++; console.log(`  already in library  ${rel}`); continue; }

    const folder = rel.split("/")[0];
    const category = entry.category ?? (CATEGORIES.includes(folder) ? folder : "unsorted");
    const name = entry.name ?? basename(file, extname(file));
    try {
      const img = await processImage(buf, name, `photos/${category}`);
      const row = await db.media.create({
        data: { ...img, category, alt: entry.alt ?? undefined, inGallery: entry.gallery ?? category !== "unsorted", sourceFile: `google-maps/${rel}` },
      });
      if (entry.roomType) {
        const rt = await db.roomType.findUnique({ where: { slug: entry.roomType }, include: { photos: true } });
        if (rt) await db.roomTypePhoto.create({ data: { roomTypeId: rt.id, mediaId: row.id, sortOrder: rt.photos.length } });
        else console.warn(`  ! room type "${entry.roomType}" not found for ${rel}`);
      }
      if (entry.hero) heroIds.add(row.id);
      imported++;
      console.log(`  ✓ ${rel} → ${img.url} (${img.width}×${img.height}, ${category})`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${rel}: ${(e as Error).message}`);
    }
  }

  if (heroIds.size !== (media.heroImageIds ?? []).length) {
    await db.setting.update({ where: { key: "media" }, data: { value: { ...media, heroImageIds: [...heroIds] } } });
  }
  console.log(`\nImported ${imported}, skipped ${skipped}, failed ${failed}. Assign photos in /admin/media.`);
  console.log("Note: the running site caches content — restart `npm run dev` (or save anything in the admin) to see new photos.");
}

main().finally(() => db.$disconnect());
