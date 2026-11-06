/**
 * Language registry — the ONLY place to add a language.
 * To launch Hebrew/Turkish/Armenian: add messages/<code>.json and set `enabled: true`.
 * Database content is stored as {locale: text} maps, so no migration is needed.
 */
export const LOCALE_REGISTRY = {
  ka: { label: "ქართული", short: "KA", dir: "ltr", hreflang: "ka-GE", enabled: true, intl: "ka-GE" },
  en: { label: "English", short: "EN", dir: "ltr", hreflang: "en", enabled: true, intl: "en-GB" },
  ru: { label: "Русский", short: "RU", dir: "ltr", hreflang: "ru", enabled: true, intl: "ru-RU" },
  he: { label: "עברית", short: "HE", dir: "rtl", hreflang: "he", enabled: false, intl: "he-IL" },
  tr: { label: "Türkçe", short: "TR", dir: "ltr", hreflang: "tr", enabled: false, intl: "tr-TR" },
  hy: { label: "Հայերեն", short: "HY", dir: "ltr", hreflang: "hy", enabled: false, intl: "hy-AM" },
} as const;

export type AnyLocale = keyof typeof LOCALE_REGISTRY;

export const locales = (Object.keys(LOCALE_REGISTRY) as AnyLocale[]).filter(
  (l) => LOCALE_REGISTRY[l].enabled,
) as ("ka" | "en" | "ru")[];
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ka";
/** Fallback order when a translation is missing in the database */
export const fallbackChain: AnyLocale[] = ["en", "ka", "ru"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as string[]).includes(value);
}
