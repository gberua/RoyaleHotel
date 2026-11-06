import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { AlertCircle, Check, Clock } from "lucide-react";
import { VoucherLink } from "@/components/booking/VoucherLink";
import { rootLocale } from "@/i18n/root-locale";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { bookingAccess } from "@/lib/booking/guest-session";
import { loadBooking } from "@/lib/booking/load";
import { syncPayment } from "@/lib/payments";
import { retryPayment } from "@/actions/guest-booking";
import { BookingSummary } from "@/components/booking/BookingSummary";

export const metadata: Metadata = { robots: { index: false } };

/** Guest lands here from the payment page. We re-check the payment with the provider before showing anything. */
async function Result({ searchParams, locale }: { searchParams: PageProps<"/[locale]/booking/return">["searchParams"]; locale: string }) {
  await connection();
  const t = await getTranslations({ locale });
  const paymentId = String((await searchParams).p ?? "");
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  const access = await bookingAccess();
  if (!payment || access !== payment.bookingId) {
    return <p className="rounded-2xl bg-mist p-6">{t("manageBooking.notFound")} <Link href="/booking/manage" className="text-sea-700 underline">{t("checkout.manage")}</Link></p>;
  }
  const status = await syncPayment(payment.id).catch(() => "pending" as const);
  const b = (await loadBooking({ id: payment.bookingId }))!;
  const confirmed = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(b.status);
  return (
    <div className="space-y-5">
      {confirmed ? (
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sea-500 text-ink-950"><Check size={28} aria-hidden /></span>
          <h1 className="mt-4 text-5xl leading-none">{t("checkout.confirmedTitle")}</h1>
          <p className="mt-3 text-ink-500">{t("checkout.confirmedText")}</p>
          {b.guest && <p className="mt-1 text-sm text-ink-700">{t("checkout.emailSent", { email: b.guest.email })}</p>}
        </div>
      ) : status === "pending" ? (
        <div className="text-center">
          <Clock className="mx-auto text-sea-700" size={40} aria-hidden />
          <h1 className="mt-4 text-5xl leading-none">{t("checkout.pendingTitle")}</h1>
          <p className="mt-3 text-ink-500">{t("checkout.pendingText")}</p>
          <a href={`?p=${payment.id}`} className="btn btn-ghost mt-4">↻</a>
        </div>
      ) : (
        <div className="rounded-2xl bg-amber-50 p-5 text-amber-950">
          <p className="flex gap-2 font-semibold"><AlertCircle aria-hidden /> {status === "cancelled" ? t("checkout.err.payment_cancelled") : t("checkout.err.payment_failed")}</p>
          {b.status === "PENDING" && b.holdExpiresAt && b.holdExpiresAt > new Date() ? (
            <form action={retryPayment} className="mt-4">
              <input type="hidden" name="booking" value={b.id} /><input type="hidden" name="locale" value={locale} />
              <button className="btn btn-accent">{t("checkout.payNow", { amount: formatMoney(b.depositDue || b.grandTotal, undefined, locale) })}</button>
            </form>
          ) : (
            <Link href="/book" className="btn btn-primary mt-4">{t("checkout.newSearch")}</Link>
          )}
        </div>
      )}
      {!b.code.startsWith("HOLD-") && <BookingSummary b={b} locale={locale} />}
      {confirmed && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <VoucherLink label={t("checkout.downloadVoucher")} />
          <Link href="/booking/manage" className="btn btn-ghost">{t("checkout.manage")}</Link>
        </div>
      )}
    </div>
  );
}

export default async function ReturnPage({ searchParams }: PageProps<"/[locale]/booking/return">) {
  const locale = await rootLocale();
  return (
    <section className="container-x max-w-xl pb-24 pt-[calc(var(--header-h)+3rem)]">
      <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-mist" />}><Result searchParams={searchParams} locale={locale} /></Suspense>
    </section>
  );
}
