import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { BadgeCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { getOffers } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { Markdown } from "@/lib/markdown";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { CopyCode } from "@/components/ui/CopyCode";

export async function generateStaticParams() {
  return (await db.offer.findMany({ where: { active: true }, select: { slug: true } })).map((o) => ({ slug: o.slug }));
}

async function find(slug: string) {
  return (await getOffers()).find((o) => o.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/offers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await rootLocale();
  const offer = await find(slug);
  if (!offer) return {};
  return pageMetadata({ title: tr(offer.title, locale), description: tr(offer.summary, locale), path: `/offers/${slug}`, locale, image: offer.image?.url });
}

/**
 * All slugs are prerendered (generateStaticParams), so direct visits get complete static HTML
 * with no loading skeleton (no layout shift). Client navigations are covered by <Link> prefetching.
 */
export const instant = false;

export default async function OfferPage({ params }: PageProps<"/[locale]/offers/[slug]">) {
  const { slug } = await params;
  const locale = await rootLocale();
  const offer = await find(slug);
  if (!offer) notFound();
  const t = await getTranslations({ locale });
  return (
    <>
      <PageHero eyebrow={t("nav.offers")} title={tr(offer.title, locale)} intro={tr(offer.summary, locale)} image={offer.image} locale={locale} />
      <section className="container-x grid gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_22rem]">
        <Markdown text={tr(offer.body, locale)} className="prose-hotel max-w-2xl text-lg" />
        <aside className="h-fit space-y-4 rounded-[var(--radius-card)] bg-mist p-6">
          {offer.promoCode && (
            <div>
              <p className="label">{t("offers.promoCode")}</p>
              <CopyCode code={offer.promoCode} />
            </div>
          )}
          {offer.validTo && <p className="text-sm text-ink-700">{t("offers.validUntil", { date: offer.validTo })}</p>}
          <p className="flex gap-2 text-sm text-ink-700"><BadgeCheck size={18} className="shrink-0 text-sea-700" aria-hidden />{t("trust.bestPrice")}</p>
          <Link href={offer.promoCode ? `/book?promo=${offer.promoCode}` : "/book"} className="btn btn-primary w-full">{t("offers.bookOffer")}</Link>
        </aside>
      </section>
    </>
  );
}
