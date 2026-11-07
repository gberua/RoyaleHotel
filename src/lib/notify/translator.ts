import { createTranslator } from "next-intl";

export type T = ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean };

/** Untyped translator for server code outside a request (emails, PDFs, callbacks). */
export function translator(locale: string, messages: Record<string, unknown>, namespace: string): T {
  return createTranslator({ locale, messages, namespace } as never) as unknown as T;
}
