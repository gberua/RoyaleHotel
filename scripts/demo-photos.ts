/**
 * npm run demo:photos
 *
 * Fills every image slot with licensed DEMO photos listed in assets/demo/demo-photos.json:
 *  1. downloads each photo (Unsplash / Pexels only) into assets/demo/ under a descriptive name,
 *  2. runs it through the standard pipeline (WebP + AVIF master, blur placeholder; next/image serves sizes),
 *  3. upserts it in the media library flagged isDemo with credit + license + KA/EN/RU alt text,
 *  4. links it to its slot (room type gallery, service, offer, attraction, gallery, home CTA),
 *  5. retires the generated placeholders from public use (kept in the library, not deleted),
 *  6. regenerates CREDITS.md.
 * Re-runnable: edit the manifest (e.g. swap a photo) and run again.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import sharp from "sharp";
import { processImage } from "../src/lib/media/process";

type Use =
  | { type: "room"; slug: string; order: number }
  | { type: "service"; key: string }
  | { type: "offer"; slug: string }
  | { type: "attraction"; slug: string }
  | { type: "cta" };
type Photo = {
  file: string; platform: "pexels" | "unsplash"; id: string; path?: string; url: string;
  photographer: string; profile: string; category: string; gallery?: number; substitute?: string;
  /** optional crop, as fractions of the original (e.g. { left: 0.24 } removes a sign on the left) */
  crop?: { left?: number; right?: number; top?: number; bottom?: number };
  uses?: Use[]; alt: Record<string, string>;
};

const DIR = join(process.cwd(), "assets", "demo");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const LICENSE = { pexels: "Pexels License", unsplash: "Unsplash License" } as const;

function downloadUrl(p: Photo) {
  return p.platform === "pexels"
    ? `https://images.pexels.com/photos/${p.id}/pexels-photo-${p.id}.jpeg?auto=compress&cs=tinysrgb&w=3200`
    : `https://images.unsplash.com/${p.path}?fm=jpg&q=88&w=3200`;
}

async function ensureFile(p: Photo) {
  const target = join(DIR, p.file);
  if (existsSync(target)) return readFile(target);
  const res = await fetch(downloadUrl(p), { headers: { "User-Agent": "RoyaleHotelDemo/1.0" } });
  if (!res.ok || !/image\//.test(res.headers.get("content-type") ?? "")) throw new Error(`download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buf);
  return buf;
}

async function main() {
  const { photos } = JSON.parse(await readFile(join(DIR, "demo-photos.json"), "utf8")) as { photos: Photo[] };
  const media: Record<string, string> = {};

  for (const p of photos) {
    try {
      let buf = await ensureFile(p);
      if (p.crop) {
        const m = await sharp(buf).metadata();
        const c = { left: 0, right: 0, top: 0, bottom: 0, ...p.crop };
        const left = Math.round(m.width! * c.left), top = Math.round(m.height! * c.top);
        buf = await sharp(buf).extract({ left, top, width: Math.round(m.width! * (1 - c.left - c.right)), height: Math.round(m.height! * (1 - c.top - c.bottom)) }).toBuffer();
      }
      const img = await processImage(buf, p.file.replace(/\.\w+$/, ""), "demo");
      const sourceFile = `demo/${p.file}`;
      const data = {
        ...img,
        category: p.category,
        alt: p.alt,
        isDemo: true,
        inGallery: p.gallery != null,
        galleryOrder: p.gallery ?? 100,
        credit: `Photo by ${p.photographer} on ${p.platform === "pexels" ? "Pexels" : "Unsplash"}`,
        creditUrl: p.url,
        license: LICENSE[p.platform],
        sourceFile,
      };
      const existing = await db.media.findFirst({ where: { sourceFile } });
      const row = existing ? await db.media.update({ where: { id: existing.id }, data }) : await db.media.create({ data });
      media[p.file] = row.id;
      console.log(`  ✓ ${p.file.padEnd(48)} ${img.width}×${img.height}`);
    } catch (e) {
      console.error(`  ✗ ${p.file}: ${(e as Error).message}`);
    }
  }

  // ── Link to slots ──
  const roomPhotos = new Map<string, { id: string; order: number }[]>();
  let ctaId: string | null = null;
  for (const p of photos) {
    const id = media[p.file];
    if (!id) continue;
    for (const u of p.uses ?? []) {
      if (u.type === "room") roomPhotos.set(u.slug, [...(roomPhotos.get(u.slug) ?? []), { id, order: u.order }]);
      if (u.type === "service") await db.service.updateMany({ where: { key: u.key }, data: { mediaId: id } });
      if (u.type === "offer") await db.offer.updateMany({ where: { slug: u.slug }, data: { mediaId: id } });
      if (u.type === "attraction") await db.attraction.updateMany({ where: { slug: u.slug }, data: { mediaId: id } });
      if (u.type === "cta") ctaId = id;
    }
  }
  for (const [slug, list] of roomPhotos) {
    const rt = await db.roomType.findUnique({ where: { slug } });
    if (!rt) { console.warn(`  ! room type ${slug} not found`); continue; }
    await db.roomTypePhoto.deleteMany({ where: { roomTypeId: rt.id } }); // only removes links, never media
    await db.roomTypePhoto.createMany({ data: list.sort((a, b) => a.order - b.order).map((x, i) => ({ roomTypeId: rt.id, mediaId: x.id, sortOrder: i })) });
  }
  // Services without a demo photo stay icon-only (no placeholder art)
  const linked = new Set(photos.flatMap((p) => (p.uses ?? []).filter((u) => u.type === "service").map((u) => (u as { key: string }).key)));
  await db.service.updateMany({ where: { key: { notIn: [...linked] } }, data: { mediaId: null } });

  if (ctaId) {
    const s = await db.setting.findUnique({ where: { key: "media" } });
    const value = (s?.value ?? {}) as Record<string, unknown>;
    const hero = ((value.heroImageIds as string[]) ?? []).slice(0, 1);
    await db.setting.update({ where: { key: "media" }, data: { value: { ...value, heroImageIds: [...hero, ctaId] } } });
  }

  await writeCredits(photos);
  console.log(`\nDone: ${Object.keys(media).length}/${photos.length} demo photos imported and linked. Restart the dev server to clear cached pages.`);
}

async function writeCredits(photos: Photo[]) {
  const rows = photos.map((p) =>
    `| ${p.file} | ${p.alt.en}${p.substitute ? ` ⚠️ *${p.substitute}*` : ""} | [${p.photographer}](${p.profile}) | [${p.platform === "pexels" ? "Pexels" : "Unsplash"}](${p.url}) |`,
  );
  const md = `# Image credits

## DEMO images — replace with real hotel photos before launch

Every photo below is a licensed stock photo used only for the demo. Each one is flagged \`isDemo\` in the media
library and shown in **Admin → Media** as **"DEMO – replace with real hotel photo"** (use the *Demo only* toggle).
Originals are in \`assets/demo/\`. To change one, edit \`assets/demo/demo-photos.json\` and run \`npm run demo:photos\`.

Licenses: [Unsplash License](https://unsplash.com/license) and [Pexels License](https://www.pexels.com/license/) —
free for commercial use; attribution is not required but is given here. No photo shows another hotel's name or logo,
or an identifiable face.

### Home hero

| File | Use | Photographer | Source |
|---|---|---|---|
| unsplash-H77FdoC4j6M.jpg | Hero, desktop — Black Sea and pebble beach under a clear sky (trimmed 3 % on the left) | [Andrew Vjivii](https://unsplash.com/photos/H77FdoC4j6M) | [Unsplash](https://unsplash.com/photos/H77FdoC4j6M) |
| pexels-16434351.jpg | Hero, mobile — turquoise sea, clouds and a pebble shore | [Nat Fernandez](https://www.pexels.com/photo/pebble-beach-on-the-sea-shore-16434351/) | [Pexels](https://www.pexels.com/photo/pebble-beach-on-the-sea-shore-16434351/) |

### Rooms, amenities, offers, Kobuleti

| File | Description | Photographer | Source |
|---|---|---|---|
${rows.join("\n")}

Downloaded 2026-11-06.
`;
  await writeFile(join(process.cwd(), "CREDITS.md"), md);
}

main().finally(() => db.$disconnect());
