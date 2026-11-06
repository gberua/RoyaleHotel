import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { getPolicies } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { Markdown } from "@/lib/markdown";
import { pageMetadata } from "@/lib/seo";

export async function generateStaticParams() {
  return (await db.policy.findMany({ select: { slug: true } })).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/policies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await rootLocale();
  const p = (await getPolicies()).find((x) => x.slug === slug);
  if (!p) return {};
  return { ...pageMetadata({ title: tr(p.title, locale), path: `/policies/${slug}`, locale }), robots: slug === "privacy" ? { index: true } : undefined };
}

/**
 * All slugs are prerendered (generateStaticParams), so direct visits get complete static HTML
 * with no loading skeleton (no layout shift). Client navigations are covered by <Link> prefetching.
 */
export const instant = false;

export default async function PolicyPage({ params }: PageProps<"/[locale]/policies/[slug]">) {
  const { slug } = await params;
  const locale = await rootLocale();
  const policies = await getPolicies();
  const p = policies.find((x) => x.slug === slug);
  if (!p) notFound();
  const t = await getTranslations({ locale });
  return (
    <div className="container-x grid gap-10 pb-20 pt-[calc(var(--header-h)+3rem)] lg:grid-cols-[16rem_1fr] lg:gap-16">
      <nav aria-label={t("policies.title")} className="lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
        <p className="eyebrow mb-4">{t("policies.title")}</p>
        <ul className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {policies.map((x) => (
            <li key={x.slug} className="shrink-0">
              <Link href={`/policies/${x.slug}`} aria-current={x.slug === slug ? "page" : undefined} className={`block rounded-xl px-3 py-2 text-sm font-medium ${x.slug === slug ? "bg-sea-50 text-sea-900" : "text-ink-700 hover:bg-mist"}`}>
                {tr(x.title, locale)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-2xl">
        <div className="flex items-center gap-3"><h1 className="text-5xl leading-none sm:text-6xl">{tr(p.title, locale)}</h1></div>
        <p className="mb-8 mt-3 text-sm text-ink-500">{t("policies.updated", { date: p.updatedAt.slice(0, 10) })}</p>
        <Markdown text={tr(p.body, locale)} />
      </article>
    </div>
  );
}
