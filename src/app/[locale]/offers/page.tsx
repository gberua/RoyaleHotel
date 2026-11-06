import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMediaByCategory, getOffers, pageCopy } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { Picture } from "@/components/ui/Picture";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("offers", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/offers", locale });
}

export default async function OffersPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("offers", locale, t);
  const [offers, hero] = await Promise.all([getOffers(), getMediaByCategory("beach", 1)]);
  return (
    <>
      <PageHero title={copy.title} intro={copy.intro} image={hero[0]} locale={locale} />
      <section className="container-x py-12 sm:py-16">
        {offers.length === 0 ? (
          <p className="rounded-2xl bg-mist p-8 text-ink-700">{t("offers.none")}</p>
        ) : (
          <ul className="grid gap-8 md:grid-cols-2">
            {offers.map((o) => (
              <li key={o.slug}>
                <article className="group relative overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-soft)] ring-1 ring-ink-100/60">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Picture image={o.image} locale={locale} fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                    {tr(o.badge, locale) && <span className="absolute left-4 top-4 rounded-full bg-sea-700 px-3 py-1 text-sm font-bold text-white">{tr(o.badge, locale)}</span>}
                  </div>
                  <div className="p-6 sm:p-8">
                    <h2 className="text-4xl leading-none"><Link href={`/offers/${o.slug}`} className="after:absolute after:inset-0">{tr(o.title, locale)}</Link></h2>
                    <p className="mt-3 text-ink-500">{tr(o.summary, locale)}</p>
                    {o.validTo && <p className="mt-3 text-sm text-ink-700">{t("offers.validUntil", { date: o.validTo })}</p>}
                    <span className="mt-6 inline-flex items-center gap-2 font-semibold text-sea-800">{t("common.learnMore")} <ArrowRight size={16} aria-hidden /></span>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
