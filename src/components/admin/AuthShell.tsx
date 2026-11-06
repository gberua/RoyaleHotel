import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { Logo } from "@/components/layout/Logo";
import { adminMessages, adminT, ADMIN_LOCALES, guestAdminLocale } from "@/lib/admin-i18n";
import { setGuestLanguage } from "@/app/admin/account/actions";

/** Frame for the screens before login: logo, language switch (KA/EN/RU), card. */
export async function AuthShell({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  const locale = await guestAdminLocale();
  const t = await adminT(locale);
  const { messages } = await adminMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="grid min-h-svh place-items-center px-4 py-8" lang={locale}>
        <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-lift)] sm:p-8">
          <form action={setGuestLanguage} className="mb-4 flex justify-end gap-1">
            <input type="hidden" name="back" value={back} />
            {ADMIN_LOCALES.map((l) => (
              <button key={l} name="lang" value={l} aria-pressed={l === locale} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${l === locale ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-mist"}`}>{t(`langs.${l}`)}</button>
            ))}
          </form>
          <div className="mb-6 flex justify-center"><Logo /></div>
          <h1 className="mb-6 text-center font-sans text-lg font-semibold">{t(title)}</h1>
          {children}
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
