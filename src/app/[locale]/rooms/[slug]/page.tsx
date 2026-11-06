import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { BadgeCheck, BedDouble, ChevronRight, Clock, Eye, Maximize2, Users } from "lucide-react";
import { Link, getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { getFromPrices, getRoomType, getRoomTypes, getSettings } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { Markdown } from "@/lib/markdown";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { contactLinks } from "@/lib/contact";
import { Icon } from "@/components/ui/Icon";
import { JsonLd } from "@/components/ui/JsonLd";
import { PhotoMosaic } from "@/components/ui/PhotoGrid";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { BookButton } from "@/components/booking/BookButton";
import { Price } from "@/components/layout/CurrencyProvider";
import { RoomCard } from "@/components/rooms/RoomCard";

export async function generateStaticParams() {
  const rooms = await db.roomType.findMany({ where: { active: true }, select: { slug: true } });
  return rooms.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/rooms/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await rootLocale();
  const room = await getRoomType(slug);
  if (!room) return {};
  return pageMetadata({
    title: tr(room.seoTitle, locale) || tr(room.name, locale),
    description: tr(room.seoDescription, locale) || tr(room.shortDescription, locale),
    path: `/rooms/${slug}`,
    locale,
    image: room.photos[0]?.url,
  });
}

/**
 * All slugs are prerendered (generateStaticParams), so direct visits get complete static HTML
 * with no loading skeleton (no layout shift). Client navigations are covered by <Link> prefetching.
 */
export const instant = false;

export default async function RoomPage({ params }: PageProps<"/[locale]/rooms/[slug]">) {
  const { slug } = await params;
  const locale = (await rootLocale()) as Locale;
  const [room, all, prices, settings] = await Promise.all([getRoomType(slug), getRoomTypes(), getFromPrices(), getSettings()]);
  if (!room) notFound();
  const t = await getTranslations({ locale });
  const name = tr(room.name, locale);
  const from = prices[room.id] ?? room.basePrice;
  const links = contactLinks(settings.contact, `${name} — ${t("book.title")}`);
  const others = all.filter((r) => r.id !== room.id).slice(0, 3);
  const photos = room.photos.map((p) => ({ id: p.id, src: p.url, width: p.width, height: p.height, alt: tr(p.alt, locale) || name, blur: p.blurDataUrl, category: p.category }));

  const facts = [
    room.sizeM2 && { icon: Maximize2, label: t("rooms.roomSize"), value: t("rooms.size", { value: room.sizeM2 }) },
    { icon: Users, label: t("rooms.maxGuests"), value: String(room.maxOccupancy) },
    { icon: BedDouble, label: t("rooms.beds"), value: tr(room.beds, locale) },
    room.view && { icon: Eye, label: t("rooms.filterView"), value: t(`rooms.view.${room.view as "sea"}`) },
  ].filter(Boolean) as { icon: typeof Users; label: string; value: string }[];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HotelRoom",
          name,
          description: tr(room.shortDescription, locale),
          url: SITE_URL + getPathname({ href: `/rooms/${slug}`, locale }),
          image: room.photos.map((p) => SITE_URL + p.url),
          floorSize: room.sizeM2 ? { "@type": "QuantitativeValue", value: room.sizeM2, unitCode: "MTK" } : undefined,
          occupancy: { "@type": "QuantitativeValue", maxValue: room.maxOccupancy },
          bed: tr(room.beds, "en"),
          amenityFeature: room.amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: tr(a.name, "en"), value: true })),
          containedInPlace: { "@id": `${SITE_URL}/#hotel` },
          offers: { "@type": "Offer", price: from / 100, priceCurrency: "GEL", availability: "https://schema.org/InStock", url: SITE_URL + getPathname({ href: "/book", locale }) },
        }}
      />
      <div className="container-x pt-[calc(var(--header-h)+1.5rem)]">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-ink-500">
          <Link href="/rooms" className="hover:text-sea-800">{t("nav.rooms")}</Link>
          <ChevronRight size={14} aria-hidden />
          <span className="text-ink-900" aria-current="page">{name}</span>
        </nav>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-5xl leading-none sm:text-6xl">{name}</h1>
            <p className="mt-3 max-w-2xl text-lg text-ink-500">{tr(room.shortDescription, locale)}</p>
          </div>
        </div>
        <PhotoMosaic photos={photos} />
      </div>

      <div className="container-x grid gap-12 py-12 lg:grid-cols-[1fr_24rem] lg:gap-16 lg:py-16">
        <div className="min-w-0 space-y-12">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {facts.map(({ icon: I, label, value }) => (
              <div key={label} className="rounded-2xl bg-mist p-4">
                <I size={20} className="text-sea-700" aria-hidden />
                <dt className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
                <dd className="mt-1 font-semibold text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h2 className="mb-4 text-4xl">{t("rooms.about")}</h2>
            <Markdown text={tr(room.description, locale)} />
          </section>

          <section>
            <h2 className="mb-6 text-4xl">{t("rooms.amenities")}</h2>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {room.amenities.map((a) => (
                <li key={a.key} className="flex items-center gap-3 text-ink-800">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sea-50 text-sea-700"><Icon name={a.icon} size={19} /></span>
                  {tr(a.name, locale)}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[var(--radius-card)] border border-ink-100 p-6">
            <h2 className="mb-2 flex items-center gap-2 font-sans text-lg font-semibold"><Clock size={18} className="text-sea-700" aria-hidden />{t("rooms.availability")}</h2>
            <p className="text-ink-500">{t("rooms.availabilityNote")}</p>
            <p className="mt-3 text-sm text-ink-700">{t("rooms.policiesShort", { in: settings.hotel.checkInFrom, out: settings.hotel.checkOutUntil })}</p>
            {room.minStay > 1 && <p className="mt-1 text-sm text-ink-700">{t("rooms.minStay", { count: room.minStay })}</p>}
          </section>
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
          <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-lift)] ring-1 ring-ink-100 sm:p-6">
            <p className="text-sm text-ink-500">{t("rooms.priceFrom")}</p>
            <p className="mb-5 flex items-baseline gap-1">
              <Price amount={from} className="font-display text-5xl leading-none text-ink-900" />
              <span className="text-sm text-ink-500">{t("common.perNight")}</span>
            </p>
            <BookButton room={room.slug} className="btn btn-accent w-full !min-h-14 text-base">{t("common.bookNow")}</BookButton>
            <ul className="mt-5 space-y-2 text-sm text-ink-700">
              <li className="flex gap-2"><BadgeCheck size={18} className="shrink-0 text-sea-700" aria-hidden />{t("trust.bestPrice")}</li>
              <li className="flex gap-2"><BadgeCheck size={18} className="shrink-0 text-sea-700" aria-hidden />{t("trust.freeCancellation", { days: settings.booking.freeCancellationDays })}</li>
            </ul>
            {links.whatsapp && (
              <a href={links.whatsapp} target="_blank" rel="noopener" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-mist py-3 text-sm font-semibold text-ink-900 hover:bg-foam">
                <BrandIcon name="whatsapp" className="h-4 w-4" color="#25D366" /> {t("floating.whatsapp")}
              </a>
            )}
          </div>
        </aside>
      </div>

      {others.length > 0 && (
        <section className="bg-mist py-16 sm:py-20">
          <div className="container-x">
            <h2 className="mb-8 text-4xl sm:text-5xl">{t("rooms.otherRooms")}</h2>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((r) => <li key={r.id}><RoomCard room={r} fromPrice={prices[r.id] ?? r.basePrice} locale={locale} /></li>)}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
