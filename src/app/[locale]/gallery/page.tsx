import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { getGallery, pageCopy } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { PhotoGrid } from "@/components/ui/PhotoGrid";

const ORDER = ["exterior", "room", "pool", "restaurant", "lobby", "beach", "view", "kobuleti", "unsorted"];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("gallery", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/gallery", locale });
}

export default async function GalleryPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("gallery", locale, t);
  const photos = await getGallery();
  const categories = ORDER.filter((c) => photos.some((p) => p.category === c));
  return (
    <>
      <PageHero title={copy.title} intro={copy.intro} image={photos[0]} locale={locale} />
      <section className="container-x py-12 sm:py-16">
        <PhotoGrid
          categories={categories}
          photos={photos.map((p) => ({ id: p.id, src: p.url, width: p.width, height: p.height, alt: tr(p.alt, locale), blur: p.blurDataUrl, category: p.category }))}
        />
      </section>
    </>
  );
}
