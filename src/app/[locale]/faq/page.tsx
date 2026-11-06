import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getFaq, pageCopy } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { JsonLd } from "@/components/ui/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("faq", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/faq", locale });
}

export default async function FaqPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("faq", locale, t);
  const faq = await getFaq();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: tr(f.question, locale), acceptedAnswer: { "@type": "Answer", text: tr(f.answer, locale) } })) }} />
      <PageHero title={copy.title} intro={copy.intro} locale={locale} />
      <section className="container-x max-w-3xl py-12 sm:py-16">
        <div className="divide-y divide-ink-100 border-y border-ink-100">
          {faq.map((f) => (
            <details key={f.id} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
                {tr(f.question, locale)}
                <ChevronDown size={20} className="shrink-0 text-sea-700 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 leading-relaxed text-ink-700">{tr(f.answer, locale)}</p>
            </details>
          ))}
        </div>
        <div className="mt-12 rounded-[var(--radius-card)] bg-mist p-8 text-center">
          <p className="font-display text-3xl">{t("faq.stillQuestions")}</p>
          <Link href="/contact" className="btn btn-primary mt-5">{t("nav.contact")}</Link>
        </div>
      </section>
    </>
  );
}
