import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { getApprovedReviews, getSettings, pageCopy } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { Stars } from "@/components/ui/Stars";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { PageHero } from "@/components/ui/PageHero";
import { ReviewCard } from "@/components/home/ReviewCard";
import { ReviewForm } from "@/components/forms/ReviewForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("reviews", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/reviews", locale });
}

export default async function ReviewsPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("reviews", locale, t);
  const [reviews, settings] = await Promise.all([getApprovedReviews(60), getSettings()]);
  const googleUrl = settings.trust.googleReviewsUrl || settings.hotel.googleMapsUrl;
  return (
    <>
      <PageHero title={copy.title} intro={copy.intro} locale={locale} />
      <section className="container-x grid gap-12 py-12 sm:py-16 lg:grid-cols-[20rem_1fr]">
        <aside className="h-fit rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-soft)] ring-1 ring-ink-100 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-700"><BrandIcon name="google" className="h-4 w-4" /> Google</p>
          <p className="mt-3 font-display text-7xl leading-none">{settings.trust.googleRating.toFixed(1)}</p>
          <Stars value={settings.trust.googleRating} size={20} className="mt-2" />
          <p className="mt-2 text-sm text-ink-500">{t("reviews.basedOn", { count: settings.trust.googleReviewCount })}</p>
          {googleUrl && <a href={googleUrl} target="_blank" rel="noopener" className="btn btn-ghost mt-6 w-full">{t("reviews.readOnGoogle")}</a>}
        </aside>
        <div className="space-y-14">
          {reviews.length ? (
            <ul className="grid gap-5 sm:grid-cols-2">{reviews.map((r) => <li key={r.id}><ReviewCard review={r} /></li>)}</ul>
          ) : (
            <p className="rounded-[var(--radius-card)] bg-sand-50 p-8 text-lg text-ink-700 ring-1 ring-sand-300/60">{t("reviews.empty")}</p>
          )}
          <section id="write" className="rounded-[var(--radius-card)] bg-mist p-6 sm:p-10">
            <h2 className="text-4xl leading-none">{t("reviews.writeTitle")}</h2>
            <p className="mb-8 mt-3 text-ink-500">{t("reviews.writeIntro")}</p>
            <ReviewForm />
          </section>
        </div>
      </section>
    </>
  );
}
