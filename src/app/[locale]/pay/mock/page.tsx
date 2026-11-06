import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { CreditCard } from "lucide-react";
import { rootLocale } from "@/i18n/root-locale";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { mockProvider } from "@/lib/payments/mock";
import { completeMockPayment } from "@/actions/guest-booking";

export const metadata: Metadata = { robots: { index: false } };

async function MockPay({ searchParams, locale }: { searchParams: PageProps<"/[locale]/pay/mock">["searchParams"]; locale: string }) {
  await connection();
  if (!mockProvider.configured()) notFound();
  const ref = String((await searchParams).ref ?? "");
  const p = await db.payment.findFirst({ where: { providerRef: ref, provider: "mock" } });
  if (!p) notFound();
  const t = await getTranslations({ locale });
  return (
    <div className="mx-auto max-w-md rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-lift)] ring-1 ring-ink-100">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-900"><CreditCard aria-hidden /></span>
      <h1 className="mt-4 font-sans text-2xl font-semibold">{t("mockpay.title")}</h1>
      <p className="mt-2 text-sm text-ink-500">{t("mockpay.text")}</p>
      <p className="mt-6 text-sm text-ink-500">{t("mockpay.amount")}</p>
      <p className="text-3xl font-bold" data-testid="mock-amount">{formatMoney(p.amount, undefined, locale, 2)}</p>
      <form action={completeMockPayment} className="mt-6 grid gap-2">
        <input type="hidden" name="ref" value={ref} />
        <input type="hidden" name="locale" value={locale} />
        <button name="outcome" value="success" className="btn btn-accent">{t("mockpay.success")}</button>
        <button name="outcome" value="fail" className="btn btn-ghost">{t("mockpay.fail")}</button>
        <button name="outcome" value="cancel" className="btn btn-ghost">{t("mockpay.cancel")}</button>
      </form>
    </div>
  );
}

export default async function MockPayPage({ searchParams }: PageProps<"/[locale]/pay/mock">) {
  const locale = await rootLocale();
  return (
    <section className="container-x pb-24 pt-[calc(var(--header-h)+3rem)]">
      <Suspense fallback={null}><MockPay searchParams={searchParams} locale={locale} /></Suspense>
    </section>
  );
}
