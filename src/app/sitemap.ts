import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { LOCALE_REGISTRY, locales, defaultLocale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";

/** Every public page in every language, with hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [rooms, offers, policies] = await Promise.all([
    db.roomType.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    db.offer.findMany({ where: { active: true }, select: { slug: true, createdAt: true } }),
    db.policy.findMany({ select: { slug: true, updatedAt: true } }),
  ]);
  const pages: { path: string; priority: number; lastModified?: Date }[] = [
    { path: "/", priority: 1 },
    { path: "/rooms", priority: 0.9 },
    ...rooms.map((r) => ({ path: `/rooms/${r.slug}`, priority: 0.8, lastModified: r.updatedAt })),
    { path: "/offers", priority: 0.7 },
    ...offers.map((o) => ({ path: `/offers/${o.slug}`, priority: 0.6, lastModified: o.createdAt })),
    { path: "/amenities", priority: 0.7 },
    { path: "/gallery", priority: 0.6 },
    { path: "/kobuleti", priority: 0.7 },
    { path: "/reviews", priority: 0.6 },
    { path: "/contact", priority: 0.7 },
    { path: "/faq", priority: 0.5 },
    ...policies.map((p) => ({ path: `/policies/${p.slug}`, priority: 0.3, lastModified: p.updatedAt })),
  ];
  const url = (path: string, locale: (typeof locales)[number]) => SITE_URL + getPathname({ href: path, locale });
  return pages.flatMap((p) =>
    locales.map((locale) => ({
      url: url(p.path, locale),
      lastModified: p.lastModified,
      priority: p.priority,
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((l) => [LOCALE_REGISTRY[l].hreflang, url(p.path, l)])),
          "x-default": url(p.path, defaultLocale),
        },
      },
    })),
  );
}
