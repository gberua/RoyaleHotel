import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { pageMetadata } from "@/lib/seo";
import { formatMoney } from "@/lib/money";
import { bookingAccess } from "@/lib/booking/guest-session";
import { loadBooking } from "@/lib/booking/load";
import { cancellationPreview } from "@/lib/booking/service";
import { signOutBooking } from "@/actions/guest-booking";
import { VoucherLink } from "@/components/booking/VoucherLink";
import { BookingSummary } from "@/components/booking/BookingSummary";
import { CancelPanel, LookupForm } from "@/components/booking/ManageForms";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  return { ...pageMetadata({ title: t("manage.title"), path: "/booking/manage", locale }), robots: { index: false } };
}

async function Manage({ searchParams, locale }: { searchParams: PageProps<"/[locale]/booking/manage">["searchParams"]; locale: string }) {
  await connection();
  const t = await getTranslations({ locale });
  const id = await bookingAccess();
  const b = id ? await loadBooking({ id }) : null;
  if (!b || b.code.startsWith("HOLD-")) {
    const code = (await searchParams).code;
    return (
      <>
        <p className="mb-6 mt-4 text-ink-500">{t("manage.intro")}</p>
        <LookupForm code={typeof code === "string" ? code : undefined} />
      </>
    );
  }
  const money = (n: number) => formatMoney(n, undefined, locale);
  const canCancel = ["PENDING", "CONFIRMED"].includes(b.status);
  const terms = canCancel ? await cancellationPreview(b.id) : null;
  return (
    <div className="mt-6 space-y-5">
      <BookingSummary b={b} locale={locale} />
      <div className="flex flex-wrap gap-2">
        {["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(b.status) && <VoucherLink label={t("checkout.downloadVoucher")} />}
        <form action={signOutBooking}><input type="hidden" name="locale" value={locale} /><button className="btn btn-ghost">{t("manageBooking.signOut")}</button></form>
      </div>
      {terms && (
        <CancelPanel
          bookingId={b.id}
          refund={terms.refund}
          free={terms.freeCancellation ? t("manageBooking.cancelFree", { date: terms.deadline }) : null}
          penaltyLabel={t("manageBooking.cancelPenalty", { penalty: money(terms.penalty) })}
          refundLabel={b.amountPaid > 0 ? t("manageBooking.refund", { amount: money(terms.refund) }) : t("manageBooking.noRefund")}
        />
      )}
    </div>
  );
}

export default async function ManageBookingPage({ searchParams }: PageProps<"/[locale]/booking/manage">) {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  return (
    <section className="container-x max-w-xl pb-24 pt-[calc(var(--header-h)+3rem)]">
      <h1 className="text-5xl leading-none sm:text-6xl">{t("manage.title")}</h1>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-mist" />}><Manage searchParams={searchParams} locale={locale} /></Suspense>
    </section>
  );
}
