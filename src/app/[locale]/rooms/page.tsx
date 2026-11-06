import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { getFromPrices, getMediaByCategory, getRoomTypes, pageCopy } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { RoomCard } from "@/components/rooms/RoomCard";
import { RoomsExplorer } from "@/components/rooms/RoomsExplorer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("rooms", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/rooms", locale });
}

export default async function RoomsPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("rooms", locale, t);
  const [rooms, prices, heroImg] = await Promise.all([getRoomTypes(), getFromPrices(), getMediaByCategory("room", 1)]);
  const cards = Object.fromEntries(
    await Promise.all(rooms.map(async (r, i) => [r.id, <RoomCard key={r.id} room={r} fromPrice={prices[r.id] ?? r.basePrice} locale={locale} priority={i < 2} headingLevel={2} />] as const)),
  );
  return (
    <>
      <PageHero title={copy.title} intro={copy.intro} image={heroImg[0]} locale={locale} />
      <section className="container-x py-12 sm:py-16">
        <RoomsExplorer
          items={rooms.map((r) => ({ id: r.id, slug: r.slug, view: r.view, maxOccupancy: r.maxOccupancy, price: prices[r.id] ?? r.basePrice }))}
          cards={cards}
          typeNames={Object.fromEntries(rooms.map((r) => [r.slug, tr(r.name, locale)]))}
        />
      </section>
    </>
  );
}
