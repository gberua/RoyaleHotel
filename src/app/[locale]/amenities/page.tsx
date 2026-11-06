import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { getHotelAmenities, getMediaByCategory, getServices, pageCopy } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { pageMetadata } from "@/lib/seo";
import { Icon } from "@/components/ui/Icon";
import { BookButton } from "@/components/booking/BookButton";
import { PageHero } from "@/components/ui/PageHero";
import { Picture } from "@/components/ui/Picture";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("amenities", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/amenities", locale });
}

export default async function AmenitiesPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("amenities", locale, t);
  const [services, amenities, hero] = await Promise.all([getServices(), getHotelAmenities(), getMediaByCategory("pool", 1)]);
  const withImage = services.filter((s) => s.image);
  const compact = services.filter((s) => !s.image);
  return (
    <>
      <PageHero title={copy.title} intro={copy.intro} image={hero[0]} locale={locale} />
      <section className="container-x py-14 sm:py-20">
        <h2 className="eyebrow mb-6 !font-sans">{t("amenities.hotelAmenities")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {amenities.map((a) => (
            <li key={a.key} className="flex items-center gap-3 rounded-2xl bg-mist p-4 text-sm font-medium text-ink-800">
              <Icon name={a.icon} size={20} className="shrink-0 text-sea-700" /> {tr(a.name, locale)}
            </li>
          ))}
        </ul>
      </section>
      <section className="container-x space-y-16 pb-16 sm:space-y-24 sm:pb-24">
        {withImage.map((s, i) => (
          <article key={s.key} className="reveal grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={`relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] ${i % 2 ? "lg:order-2" : ""}`}>
              <Picture image={s.image} locale={locale} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
            </div>
            <div>
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sea-50 text-sea-700"><Icon name={s.icon} size={26} /></span>
              <h2 className="mt-5 text-5xl leading-none">{tr(s.title, locale)}</h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-500">{tr(s.description, locale)}</p>
            </div>
          </article>
        ))}
      </section>
      {compact.length > 0 && (
        <section className="bg-mist py-16 sm:py-20">
          <ul className="container-x grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {compact.map((s) => (
              <li key={s.key} className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-soft)]">
                <Icon name={s.icon} size={26} className="text-sea-700" />
                <h3 className="mt-4 text-3xl leading-none">{tr(s.title, locale)}</h3>
                <p className="mt-2 text-ink-500">{tr(s.description, locale)}</p>
              </li>
            ))}
          </ul>
          <div className="container-x mt-10"><BookButton>{t("common.bookNow")}</BookButton></div>
        </section>
      )}
    </>
  );
}
