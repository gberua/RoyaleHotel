import { getRequestConfig } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { defaultLocale, isLocale } from "./locales";

export default getRequestConfig(async ({ locale: override }) => {
  const candidate = override ?? (await rootLocale());
  const locale = isLocale(candidate) ? candidate : defaultLocale;
  return {
    locale,
    timeZone: "Asia/Tbilisi",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
