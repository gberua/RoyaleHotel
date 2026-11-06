import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { db } from "./db";
import { tr } from "./i18n-content";
import { settingsSchema, type Settings } from "./settings-schema";

/**
 * Cached read layer for the public site. Every function is tagged; admin mutations call
 * `updateTag(<tag>)` so changes appear immediately without a redeploy.
 */
export const TAGS = {
  settings: "settings",
  rooms: "rooms",
  media: "media",
  content: "content",
  reviews: "reviews",
  offers: "offers",
  currencies: "currencies",
} as const;

export type Img = {
  id: string;
  url: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
  alt: Record<string, string> | null;
  category: string;
 
  isDemo: boolean;
  credit: string | null;
  creditUrl: string | null;
};

type MediaRow = {
  id: string; url: string; width: number; height: number; blurDataUrl: string | null;
  alt: unknown; category: string; isDemo: boolean; credit: string | null; creditUrl: string | null;
};
const toImg = (m: MediaRow): Img => ({
  id: m.id, url: m.url, width: m.width, height: m.height, blurDataUrl: m.blurDataUrl,
  alt: (m.alt as Record<string, string> | null) ?? null, category: m.category,
  isDemo: m.isDemo, credit: m.credit, creditUrl: m.creditUrl,
});

// ─── Settings ───
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.settings);
  const rows = await db.setting.findMany();
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export async function getCurrencies() {
  "use cache";
  cacheLife("hours"); // daily NBG updates show up within the hour even without a tag refresh
  cacheTag(TAGS.currencies);
  const rows = await db.currency.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } });
  return rows.map((c) => ({ code: c.code, symbol: c.symbol, rate: Number(c.rate), isBase: c.isBase }));
}
export type CurrencyInfo = Awaited<ReturnType<typeof getCurrencies>>[number];

// ─── Media ───
export async function getMediaByIds(ids: string[]): Promise<Img[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.media);
  if (!ids.length) return [];
  const rows = await db.media.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, toImg(r)]));
  return ids.map((id) => byId.get(id)).filter((x): x is Img => Boolean(x));
}

export async function getHeroImages(): Promise<Img[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.media, TAGS.settings);
  const settings = await getSettings();
  const chosen = await getMediaByIds(settings.media.heroImageIds);
  if (chosen.length) return chosen;
  const fallback = await db.media.findMany({ where: { category: { in: ["exterior", "view", "beach"] } }, take: 1 });
  return fallback.map(toImg);
}

/** Optional portrait hero for phones (Settings → Media → Mobile hero). */
export async function getHeroMobileImage(): Promise<Img | null> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.media, TAGS.settings);
  const settings = await getSettings();
  if (!settings.media.heroMobileImageId) return null;
  return (await getMediaByIds([settings.media.heroMobileImageId]))[0] ?? null;
}

export async function getGallery(): Promise<Img[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.media);
  const rows = await db.media.findMany({
    where: { inGallery: true },
    orderBy: [{ galleryOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toImg);
}

export async function getMediaByCategory(category: string, take = 12): Promise<Img[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.media);
  const rows = await db.media.findMany({ where: { category }, orderBy: { galleryOrder: "asc" }, take });
  return rows.map(toImg);
}

// ─── Rooms ───
const roomTypeInclude = {
  photos: { include: { media: true }, orderBy: { sortOrder: "asc" as const } },
  amenities: { include: { amenity: true }, orderBy: { amenity: { sortOrder: "asc" as const } } },
  _count: { select: { rooms: { where: { active: true } } } },
};

type RoomTypeRow = Awaited<ReturnType<typeof queryRoomTypes>>[number];
function queryRoomTypes() {
  return db.roomType.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { basePrice: "asc" }],
    include: roomTypeInclude,
  });
}

function mapRoomType(r: RoomTypeRow) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name as Record<string, string>,
    shortDescription: (r.shortDescription ?? {}) as Record<string, string>,
    description: (r.description ?? {}) as Record<string, string>,
    sizeM2: r.sizeM2,
    beds: (r.beds ?? {}) as Record<string, string>,
    view: r.view,
    maxAdults: r.maxAdults,
    maxChildren: r.maxChildren,
    maxOccupancy: r.maxOccupancy,
    extraBeds: r.extraBeds,
    basePrice: r.basePrice,
    weekendPrice: r.weekendPrice,
    minStay: r.minStay,
    featured: r.featured,
    roomCount: r._count.rooms,
    seoTitle: (r.seoTitle ?? {}) as Record<string, string>,
    seoDescription: (r.seoDescription ?? {}) as Record<string, string>,
    photos: r.photos.map((p) => toImg(p.media)),
    amenities: r.amenities.map((a) => ({
      key: a.amenity.key,
      icon: a.amenity.icon,
      name: a.amenity.name as Record<string, string>,
    })),
  };
}
export type RoomTypeView = ReturnType<typeof mapRoomType>;

export async function getRoomTypes(): Promise<RoomTypeView[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.rooms, TAGS.media);
  return (await queryRoomTypes()).map(mapRoomType);
}

export async function getRoomType(slug: string): Promise<RoomTypeView | null> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.rooms, TAGS.media);
  const r = await db.roomType.findFirst({ where: { slug, active: true }, include: roomTypeInclude });
  return r ? mapRoomType(r) : null;
}

/** Lowest nightly price per room type across base + seasonal rates ("from" price). */
export async function getFromPrices(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.rooms);
  const types = await db.roomType.findMany({ where: { active: true }, include: { seasonRates: true } });
  return Object.fromEntries(
    types.map((t) => [t.id, Math.min(t.basePrice, ...t.seasonRates.map((s) => s.price))]),
  );
}

export async function getHotelAmenities() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.content);
  const rows = await db.amenity.findMany({ where: { scope: "hotel" }, orderBy: { sortOrder: "asc" } });
  return rows.map((a) => ({ key: a.key, icon: a.icon, name: a.name as Record<string, string> }));
}

// ─── Content ───
export type PageContent = { sections: Record<string, Record<string, string>> & { order?: string[]; hidden?: string[] }; seoTitle: Record<string, string>; seoDescription: Record<string, string> };

/** Published page content — or, for staff previewing (Draft Mode), the unpublished draft. */
export async function getPage(key: string): Promise<PageContent> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.content);
  const p = await db.page.findUnique({ where: { key } });
  const preview = (await draftMode()).isEnabled && p?.draft ? (p.draft as Partial<PageContent>) : null;
  return {
    sections: (preview?.sections ?? p?.sections ?? {}) as PageContent["sections"],
    seoTitle: (preview?.seoTitle ?? p?.seoTitle ?? {}) as Record<string, string>,
    seoDescription: (preview?.seoDescription ?? p?.seoDescription ?? {}) as Record<string, string>,
  };
}

/** Title / intro / SEO texts of a public page: what the admin wrote, else the built-in wording. */
export async function pageCopy(key: string, locale: string, t: (k: string) => string) {
  const page = await getPage(key);
  const title = tr(page.sections.title, locale) || t(`${key}.title`);
  const intro = tr(page.sections.intro, locale) || t(`${key}.intro`);
  return { title, intro, metaTitle: tr(page.seoTitle, locale) || title, metaDescription: tr(page.seoDescription, locale) || intro, page };
}

export async function getServices() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.content, TAGS.media);
  const rows = await db.service.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const media = await getMediaByIds(rows.map((r) => r.mediaId).filter((x): x is string => !!x));
  const byId = new Map(media.map((m) => [m.id, m]));
  return rows.map((s) => ({
    key: s.key,
    icon: s.icon,
    title: s.title as Record<string, string>,
    description: s.description as Record<string, string>,
    image: s.mediaId ? byId.get(s.mediaId) ?? null : null,
  }));
}

export async function getOffers() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.offers, TAGS.media);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const rows = await db.offer.findMany({ where: (await draftMode()).isEnabled ? {} : { active: true, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { sortOrder: "asc" } });
  const media = await getMediaByIds(rows.map((r) => r.mediaId).filter((x): x is string => !!x));
  const byId = new Map(media.map((m) => [m.id, m]));
  return rows.map((o) => ({
    slug: o.slug,
    title: o.title as Record<string, string>,
    summary: o.summary as Record<string, string>,
    body: (o.body ?? {}) as Record<string, string>,
    badge: (o.badge ?? {}) as Record<string, string>,
    promoCode: o.promoCode,
    validFrom: o.validFrom?.toISOString().slice(0, 10) ?? null,
    validTo: o.validTo?.toISOString().slice(0, 10) ?? null,
    image: o.mediaId ? byId.get(o.mediaId) ?? null : null,
  }));
}

export async function getAttractions() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.content, TAGS.media);
  const rows = await db.attraction.findMany({ where: (await draftMode()).isEnabled ? {} : { active: true }, orderBy: { sortOrder: "asc" } });
  const media = await getMediaByIds(rows.map((r) => r.mediaId).filter((x): x is string => !!x));
  const byId = new Map(media.map((m) => [m.id, m]));
  return rows.map((a) => ({
    slug: a.slug,
    title: a.title as Record<string, string>,
    summary: a.summary as Record<string, string>,
    body: (a.body ?? {}) as Record<string, string>,
    distanceKm: a.distanceKm == null ? null : Number(a.distanceKm),
    driveMinutes: a.driveMinutes,
    mapUrl: a.mapUrl,
    image: a.mediaId ? byId.get(a.mediaId) ?? null : null,
  }));
}

export async function getFaq() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.content);
  const rows = await db.faqItem.findMany({ where: (await draftMode()).isEnabled ? {} : { active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  return rows.map((f) => ({
    id: f.id,
    category: f.category,
    question: f.question as Record<string, string>,
    answer: f.answer as Record<string, string>,
  }));
}

export async function getPolicies() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.content);
  const rows = await db.policy.findMany({ orderBy: { sortOrder: "asc" } });
  const preview = (await draftMode()).isEnabled;
  return rows.map((p) => {
    const d = preview && p.draft ? (p.draft as { title?: Record<string, string>; body?: Record<string, string> }) : null;
    return {
    slug: p.slug,
    title: (d?.title ?? p.title) as Record<string, string>,
    body: (d?.body ?? p.body) as Record<string, string>,
    updatedAt: p.updatedAt.toISOString(),
  };
  });
}

export async function getApprovedReviews(take = 30) {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.reviews);
  const rows = await db.review.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    authorName: r.authorName,
    country: r.country,
    rating: r.rating,
    title: r.title,
    body: r.body,
    stayMonth: r.stayMonth,
    reply: r.reply,
    date: (r.publishedAt ?? r.createdAt).toISOString().slice(0, 10),
  }));
}

export async function getCurrentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
