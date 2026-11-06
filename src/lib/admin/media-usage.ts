import "server-only";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/settings-schema";
import { tr } from "@/lib/i18n-content";
import { isAdminLocale, type AdminLocale } from "@/lib/admin-i18n";

export type Usage = { kind: "hero" | "heroMobile" | "og" | "room" | "service" | "offer" | "attraction" | "page" | "gallery"; label: string };

/** Where every media item is used (labels in the admin's language). Gallery membership counts as a use. */
export async function mediaUsage(loc: string, only?: string[]) {
  const locale: AdminLocale = isAdminLocale(loc) ? loc : "ka";
  const where = only ? { mediaId: { in: only } } : { mediaId: { not: null } };
  const [settingRows, rooms, services, offers, attractions, pages, gallery] = await Promise.all([
    db.setting.findMany({ where: { key: "media" } }),
    db.roomTypePhoto.findMany({ where: only ? { mediaId: { in: only } } : {}, include: { roomType: { select: { name: true } } } }),
    db.service.findMany({ where, select: { mediaId: true, title: true } }),
    db.offer.findMany({ where, select: { mediaId: true, title: true } }),
    db.attraction.findMany({ where, select: { mediaId: true, title: true } }),
    db.page.findMany({ where: only ? { ogImageId: { in: only } } : { ogImageId: { not: null } }, select: { key: true, ogImageId: true } }),
    db.media.findMany({ where: { inGallery: true, ...(only ? { id: { in: only } } : {}) }, select: { id: true } }),
  ]);
  const media = settingsSchema.parse(Object.fromEntries(settingRows.map((r) => [r.key, r.value]))).media;
  const out = new Map<string, Usage[]>();
  const add = (id: string | null | undefined, u: Usage) => { if (id && (!only || only.includes(id))) out.set(id, [...(out.get(id) ?? []), u]); };
  media.heroImageIds.forEach((id, i) => add(id, { kind: "hero", label: i === 0 ? "hero" : "cta" }));
  add(media.heroMobileImageId, { kind: "heroMobile", label: "heroMobile" });
  add(media.ogImageId, { kind: "og", label: "og" });
  for (const r of rooms) add(r.mediaId, { kind: "room", label: tr(r.roomType.name, locale) });
  for (const s of services) add(s.mediaId, { kind: "service", label: tr(s.title, locale) });
  for (const o of offers) add(o.mediaId, { kind: "offer", label: tr(o.title, locale) });
  for (const a of attractions) add(a.mediaId, { kind: "attraction", label: tr(a.title, locale) });
  for (const p of pages) add(p.ogImageId, { kind: "page", label: p.key });
  for (const g of gallery) add(g.id, { kind: "gallery", label: "gallery" });
  return out;
}
