import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { isIsoDate } from "@/lib/booking/dates";
import { pageMetadata } from "@/lib/seo";
import { BookingFlow } from "@/components/booking/BookingFlow";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  return { ...(await pageMetadata({ title: t("drawer.title"), path: "/book", locale })), robots: { index: false } };
}

async function Flow({ searchParams }: { searchParams: PageProps<"/[locale]/book">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;
  const checkIn = one(sp.checkIn), checkOut = one(sp.checkOut);
  const adults = Math.min(12, Math.max(1, Number(one(sp.adults)) || 2));
  const children = Math.min(8, Math.max(0, Number(one(sp.children)) || 0));
  const promo = (one(sp.promo) ?? "").trim().toUpperCase();
  return (
    <BookingFlow
      initial={{ promo: /^[A-Z0-9_-]{1,40}$/.test(promo) ? promo : undefined, checkIn: isIsoDate(checkIn) ? checkIn : undefined, checkOut: isIsoDate(checkOut) && checkOut! > (checkIn ?? "") ? checkOut : undefined, adults, childAges: Array(children).fill(6) }}
      preselect={one(sp.room) ?? null}
    />
  );
}

/** Full-page booking flow (same component as the drawer) — the no-JS fallback and shareable link target. */
export default async function BookPage({ searchParams }: PageProps<"/[locale]/book">) {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  return (
    <section className="container-x max-w-2xl pb-24 pt-[calc(var(--header-h)+2rem)]">
      <h1 className="mb-6 text-5xl leading-none">{t("drawer.title")}</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-mist" />}>
        <Flow searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
