import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { LOCALE_REGISTRY, defaultLocale, locales, type Locale } from "@/i18n/locales";

import { getHeroImages } from "./data";
import { SITE_URL } from "./site-url";
export { SITE_URL };

/** Canonical + hreflang alternates for a path that exists in every language. */
export function alternatesFor(path: string, locale: string): Metadata["alternates"] {
  const href = (l: Locale) => SITE_URL + getPathname({ href: path, locale: l });
  return {
    canonical: href(locale as Locale),
    languages: {
      ...Object.fromEntries(locales.map((l) => [LOCALE_REGISTRY[l].hreflang, href(l)])),
      "x-default": href(defaultLocale),
    },
  };
}

/** Short plain-text summary of markdown-lite content, for a meta description. */
export function plainSummary(markdown: string | null | undefined, max = 155): string | undefined {
  const text = (markdown ?? "")
    .replace(/^#{1,6}\s+.*$/gm, " ") // headings repeat the page title
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,;:.—–-]+$/, "") + "…";
}

/** Without its own picture a page is shared with the hotel's hero photo, so link previews are never blank. */
export async function pageMetadata({ title, description, path, locale, image }: { title: string; description?: string; path: string; locale: string; image?: string | null }): Promise<Metadata> {
  const shareImage = image || (await getHeroImages())[0]?.url;
  const images = shareImage ? [{ url: shareImage, width: 1200, height: 800 }] : undefined;
  return {
    title,
    description,
    alternates: alternatesFor(path, locale),
    openGraph: {
      title,
      description,
      url: SITE_URL + getPathname({ href: path, locale: locale as Locale }),
      locale: LOCALE_REGISTRY[locale as Locale]?.hreflang.replace("-", "_"),
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title, description, images: shareImage ? [shareImage] : undefined },
  };
}
