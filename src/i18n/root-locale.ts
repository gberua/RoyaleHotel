import { locale } from "next/root-params";
import { defaultLocale, isLocale, type Locale } from "./locales";

/**
 * The [locale] root parameter as a valid Locale. (The admin area is a separate root layout
 * without [locale], so the raw getter is typed string | undefined.)
 */
export async function rootLocale(): Promise<Locale> {
  const l = await locale();
  return isLocale(l) ? l : defaultLocale;
}
