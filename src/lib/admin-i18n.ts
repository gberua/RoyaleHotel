import "server-only";
import { createTranslator } from "next-intl";
import { cookies } from "next/headers";

import { ADMIN_LOCALES, isAdminLocale, type AdminLocale } from "./admin-i18n-shared";
export { ADMIN_LOCALES, isAdminLocale, type AdminLocale };

type Tree = { [k: string]: string | string[] | Tree };
const merge = (base: Tree, over: Tree): Tree => {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k] as Tree, v) : v;
  return out;
};

/** Admin messages for a language; any key not translated yet falls back to English instead of breaking the screen. */
export async function adminMessages(locale: string) {
  const l = isAdminLocale(locale) ? locale : "ka";
  const en = (await import("../../messages/admin/en.json")).default as unknown as Tree;
  const own = l === "en" ? en : merge(en, (await import(`../../messages/admin/${l}.json`)).default as unknown as Tree);
  return { locale: l, messages: { admin: own as Record<string, unknown> } };
}

export type AdminT = ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean };
export async function adminT(locale: string): Promise<AdminT> {
  const { locale: l, messages } = await adminMessages(locale);
  return createTranslator({ locale: l, messages, namespace: "admin" } as never) as unknown as AdminT;
}

/** Language for screens before login (login, forgot / reset password): cookie, default Georgian. */
export async function guestAdminLocale(): Promise<AdminLocale> {
  const c = (await cookies()).get("rh_admin_lang")?.value;
  return isAdminLocale(c) ? c : "ka";
}
