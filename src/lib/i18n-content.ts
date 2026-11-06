import { fallbackChain } from "@/i18n/locales";

/** A localized database field: {"ka": "...", "en": "...", "ru": "..."} */
export type Localized = Partial<Record<string, string>>;

/** Pick the text for `locale`, falling back through en → ka → ru → any value. */
export function tr(value: unknown, locale: string): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const map = value as Localized;
  if (map[locale]) return map[locale]!;
  for (const l of fallbackChain) if (map[l]) return map[l]!;
  return Object.values(map).find(Boolean) ?? "";
}
