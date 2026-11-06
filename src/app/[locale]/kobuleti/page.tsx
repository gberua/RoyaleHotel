import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { Car, MapPin } from "lucide-react";
import { getAttractions, getMediaByCategory, getSettings, pageCopy } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { Picture } from "@/components/ui/Picture";
import { JsonLd } from "@/components/ui/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("kobuleti", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/kobuleti", locale });
}

export default async function KobuletiPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("kobuleti", locale, t);
  const [items, hero, settings] = await Promise.all([getAttractions(), getMediaByCategory("beach", 2), getSettings()]);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: t("kobuleti.title"),
          itemListElement: items.map((a, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "TouristAttraction", name: tr(a.title, locale), description: tr(a.summary, locale) } })),
        }}
      />
      <PageHero title={copy.title} intro={copy.intro} image={hero[1] ?? hero[0]} locale={locale} />
      <section className="container-x py-12 sm:py-16">
        <ol className="grid gap-x-8 gap-y-14 md:grid-cols-2">
          {items.map((a, i) => (
            <li key={a.slug} className="reveal">
              <article>
                <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)]">
                  <Picture image={a.image} locale={locale} fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
                  <span className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white font-display text-xl text-ink-900">{i + 1}</span>
                </div>
                <h2 className="mt-5 text-4xl leading-none">{tr(a.title, locale)}</h2>
                <p className="mt-3 text-ink-500">{tr(a.summary, locale)}</p>
                {a.distanceKm != null && (
                  <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-700">
                    <span className="flex items-center gap-1.5"><MapPin size={15} className="text-sea-700" aria-hidden />≈ {t("common.km", { value: a.distanceKm })}</span>
                    {a.driveMinutes && <span className="flex items-center gap-1.5"><Car size={15} className="text-sea-700" aria-hidden />≈ {t("common.minutesDrive", { value: a.driveMinutes })}</span>}
                  </p>
                )}
              </article>
            </li>
          ))}
        </ol>
        <p className="mt-14 text-sm text-ink-500">{t("kobuleti.distance")}: {tr(settings.hotel.address, locale)}</p>
      </section>
    </>
  );
}
