import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { LOCALE_REGISTRY, defaultLocale, locales, type Locale } from "@/i18n/locales";

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

export function pageMetadata({ title, description, path, locale, image }: { title: string; description?: string; path: string; locale: string; image?: string | null }): Metadata {
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
      images: image ? [{ url: image, width: 1200, height: 800 }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
