export const ADMIN_LOCALES = ["ka", "en", "ru"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export const isAdminLocale = (v: unknown): v is AdminLocale => ADMIN_LOCALES.includes(v as AdminLocale);
