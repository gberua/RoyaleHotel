/**
 * npm run images        imports assets/google-maps/ (sub-folders allowed)
 * npm run photos:real   imports the real hotel photos listed in assets/real-photos/catalog.json from
 *                       ~/Downloads/royal-palace-pictures (or REAL_PHOTOS_DIR). The originals stay out of git.
 * Options: --dir <folder> --catalog <file>
 *
 * Every photo goes through the standard pipeline: auto-rotate, strip EXIF/GPS, resize, WebP + AVIF masters
 * and a blur placeholder, then a Media row.
 *
 * Safe to re-run: a file already in the library (same content) is not processed again; with a catalog its
 * details and links are updated in place, so you can edit the catalog and run again.
 *
 * Catalog (format and every field: scripts/lib/photo-catalog.ts):
 * {
 *   "onlyListed": true,                    // ignore files that are not listed
 *   "demoOutOfGallery": true,              // stock photos leave /gallery
 *   "replaceRoomPhotos": ["standard-double"],
 *   "photos": {
 *     "folder/IMG_1234.jpg": {
 *       "name": "standard-double-sea-view", "category": "room",
 *       "alt": { "ka": "...", "en": "...", "ru": "..." },
 *       "gallery": 4,                      // position on /gallery (true = on it, absent = not on it)
 *       "roomType": "standard-double", "roomOrder": 0,
 *       "slot": "hero",                    // or "cta"
 *       "services": ["pool"], "offers": ["early-summer"]
 *     }
 *   }
 * }
 * The old flat catalog ({ "IMG_1234.jpg": { … } }) still works. Without a catalog, a sub-folder name that
 * matches a category is used (assets/google-maps/pool/…).
 */
import "dotenv/config";
import { realpathSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import sharp from "sharp";
import { processImage } from "../src/lib/media/process";
import { categoryFor, entryFor, heroSettings, missingFiles, parseCatalog, type Entry, problems, storageProblem, toPosix } from "./lib/photo-catalog";

const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of (await readdir(dir).catch(() => [] as string[])).sort()) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

/** Trims a photo by fractions of its size (lossless, so the pipeline compresses it only once). */
async function cropped(buf: Buffer, crop: NonNullable<Entry["crop"]>) {
  const m = await sharp(buf).metadata();
  const c = { left: 0, right: 0, top: 0, bottom: 0, ...crop };
  const left = Math.round(m.width! * c.left), top = Math.round(m.height! * c.top);
  return sharp(buf).extract({ left, top, width: Math.round(m.width! * (1 - c.left - c.right)), height: Math.round(m.height! * (1 - c.top - c.bottom)) }).png().toBuffer();
}

export type ImportOptions = { dir: string; catalogPath: string; /** stored in Media.sourceFile as `<prefix>/<file>` */ sourcePrefix: string };

export async function importPhotos(db: PrismaClient, opts: ImportOptions) {
  const result = { imported: 0, updated: 0, skipped: 0, failed: 0 };
  const catalog = parseCatalog(JSON.parse(await readFile(opts.catalogPath, "utf8").catch(() => "{}")));
  const files = (await walk(opts.dir)).map((file) => ({ file, rel: toPosix(relative(opts.dir, file)) }));
  const listed = Object.values(catalog.photos).filter((e) => !e.skip);

  // ── Check everything first: a half-applied catalog is worse than none ──
  const errors = [...problems(catalog), ...missingFiles(catalog, files.map((f) => f.rel)).map((key) => `${key}: file is missing from ${opts.dir}`)];
  const roomSlugs = [...new Set([...catalog.replaceRoomPhotos, ...listed.flatMap((e) => (e.roomType ? [e.roomType] : []))])];
  const rooms = new Map((await db.roomType.findMany({ where: { slug: { in: roomSlugs } }, select: { id: true, slug: true } })).map((r) => [r.slug, r.id]));
  const serviceKeys = [...new Set(listed.flatMap((e) => e.services ?? []))], offerSlugs = [...new Set(listed.flatMap((e) => e.offers ?? []))];
  const services = new Set((await db.service.findMany({ where: { key: { in: serviceKeys } }, select: { key: true } })).map((x) => x.key));
  const offers = new Set((await db.offer.findMany({ where: { slug: { in: offerSlugs } }, select: { slug: true } })).map((x) => x.slug));
  errors.push(...roomSlugs.filter((x) => !rooms.has(x)).map((x) => `room type "${x}" does not exist`));
  errors.push(...serviceKeys.filter((x) => !services.has(x)).map((x) => `service "${x}" does not exist`));
  errors.push(...offerSlugs.filter((x) => !offers.has(x)).map((x) => `offer "${x}" does not exist`));
  if (errors.length) throw new Error(`Catalog problems, nothing was imported:\n  - ${errors.join("\n  - ")}`);

  if (!files.length) {
    console.log(`No photos found in ${opts.dir} — put the photos there and run again.`);
    return result;
  }

  // ── Photos ──
  const done: { id: string; entry: NonNullable<ReturnType<typeof entryFor>> }[] = [];
  for (const { file, rel } of files) {
    const entry = entryFor(catalog, rel);
    if (entry?.skip || (!entry && catalog.onlyListed)) { result.skipped++; continue; }
    const sourceFile = `${opts.sourcePrefix}/${rel}`;
    const original = await readFile(file);
    const buf = entry?.crop ? await cropped(original, entry.crop) : original;
    const checksum = createHash("sha256").update(buf).digest("hex");
    // the same picture, or (hand-picked list only) the same file with a changed crop: that one is replaced in place
    const existing = (await db.media.findUnique({ where: { checksum } })) ?? (entry && catalog.onlyListed ? await db.media.findFirst({ where: { sourceFile, isDemo: false } }) : null);
    // Only a hand-picked list (onlyListed) is the source of truth for a photo that is already in the library;
    // a plain folder import or an old flat catalog leaves it alone, so edits made in the admin are kept.
    if (existing && (!entry || !catalog.onlyListed)) { result.skipped++; console.log(`  already in library  ${rel}`); continue; }

    const category = categoryFor(rel, entry);
    const details = {
      category,
      alt: entry?.alt ?? undefined,
      // not said in the catalog: a hand-picked list keeps it off /gallery, a plain folder import shows sorted photos
      inGallery: entry?.gallery === undefined ? !catalog.onlyListed && category !== "unsorted" : entry.gallery !== false,
      ...(typeof entry?.gallery === "number" ? { galleryOrder: entry.gallery } : {}),
      isDemo: false,
      sourceFile,
    };
    try {
      let id: string;
      if (existing && existing.checksum === checksum) {
        id = (await db.media.update({ where: { id: existing.id }, data: details })).id;
        result.updated++;
        console.log(`  ↻ ${rel} (details updated)`);
      } else if (existing) {
        const img = await processImage(buf, entry?.name ?? basename(file, extname(file)), `photos/${category}`);
        id = (await db.media.update({ where: { id: existing.id }, data: { ...img, ...details } })).id; // same entry, so every slot keeps it
        result.updated++;
        console.log(`  ↻ ${rel} → ${img.url} (picture replaced, ${img.width}×${img.height})`);
      } else {
        const img = await processImage(buf, entry?.name ?? basename(file, extname(file)), `photos/${category}`);
        id = (await db.media.create({ data: { ...img, ...details } })).id;
        result.imported++;
        console.log(`  ✓ ${rel} → ${img.url} (${img.width}×${img.height}, ${category})`);
      }
      if (entry) done.push({ id, entry });
    } catch (e) {
      result.failed++;
      console.error(`  ✗ ${rel}: ${(e as Error).message}`);
    }
  }

  // A photo that failed would leave its slot half-filled (a room with no photos, an empty gallery): change no links.
  if (result.failed) {
    console.error(`\n${result.failed} photo(s) failed, so rooms, services, offers, gallery and hero were left as they were. Fix the error and run again.`);
    return result;
  }

  // ── Links: rooms, services, offers, gallery, hero ──
  for (const slug of catalog.replaceRoomPhotos) await db.roomTypePhoto.deleteMany({ where: { roomTypeId: rooms.get(slug)! } }); // links only, never photos
  const byRoom = new Map<string, { id: string; order: number }[]>();
  for (const { id, entry } of done) if (entry.roomType) byRoom.set(entry.roomType, [...(byRoom.get(entry.roomType) ?? []), { id, order: entry.roomOrder ?? Number.MAX_SAFE_INTEGER }]);
  for (const [slug, list] of byRoom) {
    const roomTypeId = rooms.get(slug)!;
    const current = await db.roomTypePhoto.findMany({ where: { roomTypeId }, orderBy: { sortOrder: "asc" } });
    const kept = current.filter((c) => !list.some((x) => x.id === c.mediaId)).map((c) => c.mediaId);
    const order = [...list.sort((a, b) => a.order - b.order).map((x) => x.id), ...kept]; // catalog photos first, in catalog order
    await db.roomTypePhoto.deleteMany({ where: { roomTypeId } });
    await db.roomTypePhoto.createMany({ data: order.map((mediaId, sortOrder) => ({ roomTypeId, mediaId, sortOrder })) });
  }
  for (const { id, entry } of done) {
    if (entry.services?.length) await db.service.updateMany({ where: { key: { in: entry.services } }, data: { mediaId: id } });
    if (entry.offers?.length) await db.offer.updateMany({ where: { slug: { in: entry.offers } }, data: { mediaId: id } });
  }
  if (catalog.demoOutOfGallery) await db.media.updateMany({ where: { isDemo: true, inGallery: true }, data: { inGallery: false } });

  const ids = { hero: done.find((d) => d.entry.slot === "hero")?.id, cta: done.find((d) => d.entry.slot === "cta")?.id, appended: done.filter((d) => d.entry.hero).map((d) => d.id) };
  if (ids.hero || ids.cta || ids.appended.length) {
    const row = await db.setting.findUnique({ where: { key: "media" } });
    const value = heroSettings((row?.value ?? {}) as Record<string, unknown>, ids) as object;
    await db.setting.upsert({ where: { key: "media" }, update: { value }, create: { key: "media", value } });
  }
  return result;
}

async function main() {
  const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const real = process.argv.includes("--real");
  const dir = arg("dir") ?? (real ? process.env.REAL_PHOTOS_DIR || join(homedir(), "Downloads", "royal-palace-pictures") : join(process.cwd(), "assets", "google-maps"));
  const catalogPath = arg("catalog") ?? (real ? join(process.cwd(), "assets", "real-photos", "catalog.json") : join(dir, "catalog.json"));
  const blocked = storageProblem(process.env.DATABASE_URL, process.env.STORAGE_DRIVER);
  if (blocked) { console.error(blocked); process.exitCode = 1; return; }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const r = await importPhotos(db, { dir, catalogPath, sourcePrefix: real ? "real" : "google-maps" });
    console.log(`\nImported ${r.imported}, updated ${r.updated}, skipped ${r.skipped}, failed ${r.failed}. See the photos in /admin/media.`);
    console.log("Note: the running site caches content — restart `npm run dev` (or save anything in the admin) to see new photos.");
    if (r.failed) process.exitCode = 1;
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

// run only as a script, not when imported by a test (realpath: the folder may be reached through a link)
const invoked = (() => { try { return pathToFileURL(realpathSync(process.argv[1] ?? "")).href; } catch { return ""; } })();
if (invoked === import.meta.url) void main();
