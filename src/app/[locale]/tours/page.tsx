import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import { rootLocale } from "@/i18n/root-locale";
import { Link } from "@/i18n/navigation";
import { getMediaByCategory, getTours, pageCopy } from "@/lib/data";
import { preferReal } from "@/lib/prefer-real";
import { tr } from "@/lib/i18n-content";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { Picture } from "@/components/ui/Picture";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("tours", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/tours", locale });
}

/** Tours the hotel offers: information and photos only, no prices and no online booking. */
export default async function ToursPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("tours", locale, t);
  const [tours, hero] = await Promise.all([getTours(), getMediaByCategory("kobuleti", 2)]);
  return (
    <>
      <PageHero title={copy.title} intro={copy.intro} image={tours[0]?.image ?? preferReal(hero[1], hero[0])} locale={locale} />
      <section className="container-x py-12 sm:py-16">
        {tours.length === 0 ? (
          <p className="rounded-2xl bg-mist p-8 text-ink-700">{t("tours.none")}</p>
        ) : (
          <ol className="space-y-16 sm:space-y-24">
            {tours.map((x, i) => {
              const body = tr(x.body, locale);
              const duration = tr(x.duration, locale);
              return (
                <li key={x.slug} className="reveal">
                  <article className="grid items-start gap-6 md:grid-cols-2 md:items-stretch md:gap-12">
                    {x.image && (
                      <div className={`relative overflow-hidden rounded-[var(--radius-card)] ${i % 2 ? "md:order-2" : ""}`}>
                        {/* at least 4:3; grows with the text column so the pictures on both sides end on the same line */}
                        <div className="aspect-[4/3]" aria-hidden />
                        <Picture image={x.image} locale={locale} fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
                      </div>
                    )}
                    <div className={x.image ? "flex flex-col" : "md:col-span-2 md:max-w-3xl"}>
                      {duration && <p className="mb-3 flex items-center gap-1.5 text-sm text-ink-700"><Clock size={15} className="text-sea-700" aria-hidden />{duration}</p>}
                      <h2 className="text-4xl leading-none sm:text-5xl">{tr(x.title, locale)}</h2>
                      <p className="mt-4 text-lg text-ink-700">{tr(x.summary, locale)}</p>
                      {body && <p className="mt-4 whitespace-pre-line text-ink-500">{body}</p>}
                      {x.photos.length > 0 && (
                        <ul className={`mt-6 grid gap-2 sm:gap-3 md:mt-auto md:pt-6 ${x.photos.length === 1 ? "grid-cols-1" : x.photos.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                          {x.photos.map((p) => (
                            <li key={p.id} className={`relative overflow-hidden rounded-xl ${x.photos.length === 1 ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
                              <Picture image={p} locale={locale} fill sizes={x.photos.length < 3 ? "(min-width:768px) 25vw, 50vw" : "(min-width:768px) 17vw, 33vw"} className="object-cover" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-16 flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-mist p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-ink-700">{t("tours.ask")}</p>
          <Link href="/contact" className="btn btn-primary shrink-0">{t("nav.contact")}</Link>
        </div>
      </section>
    </>
  );
}
