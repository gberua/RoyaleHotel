/**
 * npm run demo:hero
 *
 * Imports the licensed DEMO hero photos from assets/demo/ (see CREDITS.md), runs them through the
 * standard image pipeline (WebP + AVIF masters, blur placeholder; next/image serves responsive sizes)
 * and sets them as the home-page hero: landscape for desktop, portrait for phones.
 * Every row is flagged isDemo so the admin shows "DEMO image – replace with real hotel photo".
 * Safe to re-run.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { processImage } from "../src/lib/media/process";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DIR = join(process.cwd(), "assets", "demo");

const PHOTOS = {
  desktop: {
    file: "unsplash-H77FdoC4j6M.jpg",
    name: "demo-hero-black-sea-pebble-beach-desktop",
    credit: "Photo by Andrew Vjivii on Unsplash",
    creditUrl: "https://unsplash.com/photos/H77FdoC4j6M",
    license: "Unsplash License",
    // trim 3 % on the left (an object cut off at the frame edge)
    prepare: async (buf: Buffer) => {
      const m = await sharp(buf).metadata();
      const left = Math.round(m.width! * 0.03);
      return sharp(buf).extract({ left, top: 0, width: m.width! - left, height: m.height! }).toBuffer();
    },
    alt: {
      ka: "მშვიდი შავი ზღვა და კენჭოვანი პლაჟი მზიან დღეს (სადემონსტრაციო ფოტო)",
      en: "Calm Black Sea and pebble beach on a sunny day (demo photo)",
      ru: "Спокойное Чёрное море и галечный пляж в солнечный день (демо-фото)",
    },
  },
  mobile: {
    file: "pexels-16434351.jpg",
    name: "demo-hero-turquoise-sea-pebble-shore-mobile",
    credit: "Photo by Nat Fernandez on Pexels",
    creditUrl: "https://www.pexels.com/photo/pebble-beach-on-the-sea-shore-16434351/",
    license: "Pexels License",
    prepare: async (buf: Buffer) => buf,
    alt: {
      ka: "ფირუზისფერი ზღვა, ღრუბლები და კენჭოვანი ნაპირი (სადემონსტრაციო ფოტო)",
      en: "Turquoise sea, clouds and a pebble shore (demo photo)",
      ru: "Бирюзовое море, облака и галечный берег (демо-фото)",
    },
  },
} as const;

async function importOne(key: keyof typeof PHOTOS) {
  const p = PHOTOS[key];
  const original = await readFile(join(DIR, p.file));
  const img = await processImage(await p.prepare(original), p.name, "demo");
  const sourceFile = `demo/${p.file}`;
  const data = { ...img, category: "view", alt: p.alt, isDemo: true, inGallery: false, credit: p.credit, creditUrl: p.creditUrl, license: p.license, sourceFile };
  const existing = await db.media.findFirst({ where: { sourceFile } });
  const row = existing ? await db.media.update({ where: { id: existing.id }, data }) : await db.media.create({ data });
  console.log(`  ✓ ${key}: ${img.url} (${img.width}×${img.height})`);
  return row;
}

async function main() {
  const desktop = await importOne("desktop");
  const mobile = await importOne("mobile");
  const current = await db.setting.findUnique({ where: { key: "media" } });
  const media = (current?.value ?? {}) as Record<string, unknown>;
  const rest = ((media.heroImageIds as string[]) ?? []).filter((id) => id !== desktop.id && id !== mobile.id);
  const value = { ...media, heroImageIds: [desktop.id, ...rest], heroMobileImageId: mobile.id, ogImageId: desktop.id };
  await db.setting.upsert({ where: { key: "media" }, update: { value }, create: { key: "media", value } });
  console.log("Hero set: desktop + mobile demo photos. Restart the dev server (cached content) to see it.");
}

main().finally(() => db.$disconnect());
