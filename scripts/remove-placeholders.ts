/**
 * One-off clean-up (2026-11): the site no longer has a "PLACEHOLDER" concept.
 * • strips "[PLACEHOLDER …]" markers from every text in the database (a paragraph that starts with one is a
 *   note to the owner and is removed whole)
 * • deletes the old neutral placeholder art from the media library when nothing uses it
 * Safe to run more than once.   Usage: npx tsx scripts/remove-placeholders.ts
 */
import "dotenv/config";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

export function stripPlaceholders(text: string) {
  return text
    .split(/\n\n/)
    .filter((p) => !/^\s*\[PLACEHOLDER/i.test(p))
    .join("\n\n")
    .replace(/\s*\[PLACEHOLDER[^\]]*\]/gi, "")
    .replace(/^PLACEHOLDER\s*[—–-]\s*/i, "")
    .trim();
}

function clean<T>(v: T): { value: T; changed: boolean } {
  if (typeof v === "string") { const c = stripPlaceholders(v); return { value: c as T, changed: c !== v }; }
  if (Array.isArray(v)) { let ch = false; const out = v.map((x) => { const r = clean(x); ch ||= r.changed; return r.value; }); return { value: out as T, changed: ch }; }
  if (v && typeof v === "object") {
    let ch = false;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { const r = clean(x); ch ||= r.changed; out[k] = r.value; }
    return { value: out as T, changed: ch };
  }
  return { value: v, changed: false };
}

type AnyDelegate = { findMany: (a?: unknown) => Promise<Record<string, unknown>[]>; update: (a: unknown) => Promise<unknown> };
const TEXT_FIELDS: [string, string, string[]][] = [
  ["faqItem", "id", ["question", "answer"]],
  ["policy", "slug", ["title", "body"]],
  ["offer", "id", ["title", "summary", "body", "badge"]],
  ["roomType", "id", ["name", "shortDescription", "description", "beds", "seoTitle", "seoDescription"]],
  ["service", "id", ["title", "description"]],
  ["extra", "id", ["name", "description"]],
  ["occupancyRule", "id", ["name"]],
  ["attraction", "id", ["title", "summary", "body"]],
  ["promoCode", "id", ["description"]],
  ["page", "key", ["sections", "seoTitle", "seoDescription"]],
  ["setting", "key", ["value"]],
];

async function main() {
  let changedRows = 0;
  for (const [model, idField, fields] of TEXT_FIELDS) {
    const delegate = (db as unknown as Record<string, AnyDelegate>)[model];
    for (const row of await delegate.findMany()) {
      const data: Record<string, unknown> = {};
      for (const f of fields) { if (row[f] == null) continue; const r = clean(row[f]); if (r.changed) data[f] = r.value; }
      if (Object.keys(data).length) { await delegate.update({ where: { [idField]: row[idField] }, data }); changedRows++; console.log(`cleaned ${model} ${row[idField]}: ${Object.keys(data).join(", ")}`); }
    }
  }
  // old placeholder art: only when unused anywhere
  const rows = await db.$queryRaw<{ id: string; url: string; avifUrl: string | null }[]>`SELECT id, url, "avifUrl" FROM "Media" WHERE "isPlaceholder" = true`.catch(() => []);
  let deleted = 0;
  for (const m of rows) {
    const used = (await db.roomTypePhoto.count({ where: { mediaId: m.id } })) + (await db.service.count({ where: { mediaId: m.id } })) + (await db.offer.count({ where: { mediaId: m.id } })) + (await db.attraction.count({ where: { mediaId: m.id } }));
    const settings = await db.setting.findUnique({ where: { key: "media" } });
    if (used || JSON.stringify(settings?.value ?? {}).includes(m.id)) { console.log(`kept placeholder media ${m.id} (still in use)`); continue; }
    await db.media.delete({ where: { id: m.id } });
    for (const u of [m.url, m.avifUrl]) if (u?.startsWith("/media/")) await unlink(join(process.cwd(), "storage", "media", u.slice(7))).catch(() => undefined);
    deleted++;
  }
  console.log(`done: ${changedRows} rows cleaned, ${deleted} placeholder images deleted`);
}

main().finally(() => db.$disconnect());
