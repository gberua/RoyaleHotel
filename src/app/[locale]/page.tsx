import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { ArrowRight, BadgeCheck, Clock, CreditCard, Plane, ShieldCheck, Umbrella, Landmark } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getApprovedReviews, getFromPrices, getGallery, getHeroImages, getHeroMobileImage, getHotelAmenities, getMediaByCategory, getPage, getRoomTypes, getSettings,
} from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { hotelSchema } from "@/lib/schema";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { Picture } from "@/components/ui/Picture";
import { Icon } from "@/components/ui/Icon";
import { Stars } from "@/components/ui/Stars";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { JsonLd } from "@/components/ui/JsonLd";
import { MapEmbed } from "@/components/ui/MapEmbed";
import { HorizonHero } from "@/components/home/HorizonHero";
import { BookButton } from "@/components/booking/BookButton";
import { RoomCard } from "@/components/rooms/RoomCard";
import { ReviewCard } from "@/components/home/ReviewCard";
import { homeLayout, type HomeSection } from "@/lib/content/home";
import { Fragment, type ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const [page, hero] = await Promise.all([getPage("home"), getHeroImages()]);
  return pageMetadata({
    title: tr(page.seoTitle, locale) || t("meta.defaultTitle"),
    description: tr(page.seoDescription, locale) || t("meta.defaultDescription"),
    path: "/",
    locale,
    image: hero[0]?.url,
  });
}

export default async function HomePage() {
  const locale = (await rootLocale()) as Locale;
  const t = await getTranslations({ locale });
  const [settings, page, heroImages, heroMobile, roomTypes, fromPrices, amenities, gallery, reviews, poolImgs, beachImgs] = await Promise.all([
    getSettings(), getPage("home"), getHeroImages(), getHeroMobileImage(), getRoomTypes(), getFromPrices(), getHotelAmenities(), getGallery(),
    getApprovedReviews(6), getMediaByCategory("pool", 2), getMediaByCategory("beach", 2),
  ]);
  const s = page.sections;
  /** admin-edited text for this language, else the built-in wording */
  const txt = (key: string, fallback?: string) => tr(s[key], locale) || (fallback ? t(fallback) : "");
  const layout = homeLayout(s);
  const hero = heroImages[0];
  const featured = roomTypes.filter((r) => r.featured).slice(0, 4);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${settings.hotel.lat},${settings.hotel.lng}`;
  const prices = Object.values(fromPrices);

  const blocks: Record<HomeSection, ReactNode> = {
    trust: (
      <>
      <section id="intro" aria-label={t("trust.directPerks")} className="scroll-mt-16 border-b border-ink-100 bg-white">
        <ul className="container-x no-scrollbar flex snap-x gap-8 overflow-x-auto py-5 text-sm text-ink-700 lg:justify-between">
          {[
            { icon: BadgeCheck, text: t("trust.bestPriceShort") },
            { icon: Clock, text: t("trust.freeCancellation", { days: settings.booking.freeCancellationDays }) },
            { icon: ShieldCheck, text: t("trust.securePayment") },
            { icon: CreditCard, text: t("trust.noHiddenFees") },
          ].map(({ icon: I, text }) => (
            <li key={text} className="flex shrink-0 snap-start items-center gap-2.5"><I size={18} className="text-sea-700" aria-hidden />{text}</li>
          ))}
        </ul>
      </section>
      </>
    ),
    welcome: (
      <>
      <section className="container-x grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-2 lg:gap-20">
        <div className="reveal relative order-2 grid grid-cols-5 gap-3 lg:order-1">
          <div className="relative col-span-3 aspect-[3/4] overflow-hidden rounded-[var(--radius-card)]">
            <Picture image={gallery.find((g) => g.category === "lobby") ?? gallery[0] ?? hero} locale={locale} fill sizes="(min-width:1024px) 30vw, 60vw" className="object-cover" />
          </div>
          <div className="col-span-2 flex flex-col gap-3 pt-16">
            <div className="relative aspect-[3/4] overflow-hidden rounded-[var(--radius-card)]">
              <Picture image={poolImgs[0] ?? gallery[2]} locale={locale} fill sizes="(min-width:1024px) 20vw, 40vw" className="object-cover" />
            </div>
            <div className="rounded-[var(--radius-card)] bg-sea-700 p-4 text-white">
              <p className="font-display text-4xl leading-none">{settings.hotel.stars}★</p>
              <p className="mt-1 text-xs text-white/80">{t("home.checkInOut", { in: settings.hotel.checkInFrom, out: settings.hotel.checkOutUntil })}</p>
            </div>
          </div>
        </div>
        <div className="reveal order-1 lg:order-2">
          <SectionHeading eyebrow={txt("welcomeEyebrow", "home.welcomeEyebrow")} title={txt("welcomeTitle")} />
          <p className="mt-6 text-lg leading-relaxed text-ink-500">{txt("welcomeText")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/rooms" className="btn btn-primary">{t("common.viewAllRooms")} <ArrowRight size={18} aria-hidden /></Link>
            <Link href="/amenities" className="btn btn-ghost">{t("nav.amenities")}</Link>
          </div>
        </div>
      </section>
      </>
    ),
    rooms: (
      <>
      <section className="bg-mist py-20 sm:py-28">
        <div className="container-x">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading eyebrow={txt("roomsEyebrow", "home.featuredEyebrow")} title={txt("roomsTitle", "home.featuredTitle")} />
            <Link href="/rooms" className="link-underline hidden pb-1 font-semibold text-sea-800 sm:inline-flex sm:items-center sm:gap-2">
              {t("common.viewAllRooms")} <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
        <div className="container-x no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:gap-6 xl:grid xl:grid-cols-4 xl:overflow-visible">
          {featured.map((room) => (
            <div key={room.id} className="w-[84%] shrink-0 snap-center sm:w-[46%] lg:w-[31%] xl:w-auto">
              <RoomCard room={room} fromPrice={fromPrices[room.id] ?? room.basePrice} locale={locale} sizes="(min-width:1024px) 25vw, (min-width:640px) 46vw, 84vw" />
            </div>
          ))}
        </div>
        <div className="container-x mt-6 sm:hidden">
          <Link href="/rooms" className="btn btn-ghost w-full">{t("common.viewAllRooms")}</Link>
        </div>
      </section>
      </>
    ),
    amenities: (
      <>
      <section className="container-x grid gap-12 py-20 sm:py-28 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div className="reveal">
          <SectionHeading eyebrow={txt("amenitiesEyebrow", "home.amenitiesEyebrow")} title={txt("amenitiesTitle", "home.amenitiesTitle")} />
          <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3">
            {amenities.map((a) => (
              <li key={a.key} className="flex flex-col gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sea-50 text-sea-700"><Icon name={a.icon} size={22} /></span>
                <span className="text-[0.95rem] font-medium leading-snug text-ink-800">{tr(a.name, locale)}</span>
              </li>
            ))}
          </ul>
          <Link href="/amenities" className="link-underline mt-10 inline-flex items-center gap-2 pb-1 font-semibold text-sea-800">
            {t("amenities.title")} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="reveal relative min-h-[22rem] overflow-hidden rounded-[var(--radius-card)] lg:min-h-0">
          <Picture image={poolImgs[1] ?? poolImgs[0]} locale={locale} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
        </div>
      </section>
      </>
    ),
    beach: (
      <>
      <section className="relative isolate overflow-hidden bg-ink-900 py-20 text-white sm:py-28">
        <div className="absolute inset-0 -z-10 opacity-35">
          <Picture image={beachImgs[0]} locale={locale} fill sizes="100vw" alt="" className="object-cover" />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/40" />
        <div className="container-x grid gap-12 lg:grid-cols-2 lg:items-end">
          <div className="reveal max-w-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sea-300">{txt("beachEyebrow", "home.beachEyebrow")}</p>
            <h2 className="text-5xl leading-[1.02] sm:text-6xl">{txt("beachTitle", "home.beachTitle")}</h2>
            <p className="mt-5 text-lg leading-relaxed text-white/80">{txt("beachText")}</p>
          </div>
          <dl className="reveal grid grid-cols-3 gap-4 border-t border-white/15 pt-8">
            {[
              { icon: Umbrella, value: settings.hotel.beachDistanceM ? t("common.m", { value: settings.hotel.beachDistanceM }) : "—", label: t("home.toBeach") },
              { icon: Landmark, value: t("common.km", { value: 27 }), label: t("home.toBatumi") },
              { icon: Plane, value: t("common.km", { value: settings.hotel.airportDistanceKm }), label: t("home.toAirport") },
            ].map(({ icon: I, value, label }) => (
              <div key={label}>
                <I size={22} className="mb-3 text-sea-300" aria-hidden />
                <dt className="sr-only">{label}</dt>
                <dd className="font-display text-4xl leading-none sm:text-5xl">{value}</dd>
                <dd className="mt-2 text-xs text-white/70 sm:text-sm">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      </>
    ),
    reviews: (
      <>
      <section className="container-x py-20 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="reveal">
            <p className="eyebrow mb-3">{txt("reviewsEyebrow", "home.reviewsEyebrow")}</p>
            <p className="font-display text-[6rem] leading-none text-ink-900">{settings.trust.googleRating.toFixed(1)}</p>
            <Stars value={settings.trust.googleRating} size={22} className="mt-2" />
            <p className="mt-3 text-ink-500">{t("reviews.basedOn", { count: settings.trust.googleReviewCount })}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/reviews" className="btn btn-ghost">{t("nav.reviews")}</Link>
              {(settings.trust.googleReviewsUrl || settings.hotel.googleMapsUrl) && (
                <a href={settings.trust.googleReviewsUrl || settings.hotel.googleMapsUrl} target="_blank" rel="noopener" className="btn btn-ghost">
                  <BrandIcon name="google" className="h-4 w-4" /> {t("reviews.readOnGoogle")}
                </a>
              )}
            </div>
          </div>
          {reviews.length ? (
            <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-2 lg:px-0">
              {reviews.slice(0, 4).map((r) => <li key={r.id} className="w-[85%] shrink-0 snap-center lg:w-auto"><ReviewCard review={r} /></li>)}
            </ul>
          ) : (
            <div className="reveal flex flex-col justify-center rounded-[var(--radius-card)] bg-sand-50 p-8 ring-1 ring-sand-300/60 sm:p-12">
              <p className="text-lg leading-relaxed text-ink-700">{t("reviews.empty")}</p>
              {(settings.trust.googleReviewsUrl || settings.hotel.googleMapsUrl) && (
                <a href={settings.trust.googleReviewsUrl || settings.hotel.googleMapsUrl} target="_blank" rel="noopener" className="btn btn-primary mt-6 self-start">
                  <BrandIcon name="google" className="h-4 w-4" color="#fff" /> {t("reviews.readOnGoogle")}
                </a>
              )}
            </div>
          )}
        </div>
      </section>
      </>
    ),
    gallery: (
      <>
      {gallery.length >= 5 && (
        <section className="pb-20 sm:pb-28">
          <div className="container-x flex flex-wrap items-end justify-between gap-6">
            <SectionHeading eyebrow={txt("galleryEyebrow", "home.galleryEyebrow")} title={txt("galleryTitle", "home.galleryTitle")} />
            <Link href="/gallery" className="link-underline inline-flex items-center gap-2 pb-1 font-semibold text-sea-800">
              {t("common.seeAllPhotos")} <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <div className="container-x mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:grid-rows-2 sm:gap-4">
            {gallery.slice(0, 5).map((img, i) => (
              <Link
                key={img.id}
                href="/gallery"
                className={`reveal group relative overflow-hidden rounded-2xl ${i === 0 ? "col-span-2 row-span-2 aspect-square sm:aspect-auto" : "aspect-square"}`}
              >
                <Picture image={img} locale={locale} fill sizes={i === 0 ? "(min-width:640px) 50vw, 100vw" : "(min-width:640px) 25vw, 50vw"} className="object-cover transition-transform duration-700 group-hover:scale-105" />
              </Link>
            ))}
          </div>
        </section>
      )}
      </>
    ),
    location: (
      <>
      <section className="bg-mist py-20 sm:py-28">
        <div className="container-x grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
          <div>
            <SectionHeading eyebrow={txt("locationEyebrow", "home.locationEyebrow")} title={tr(settings.hotel.address, locale)} />
            <p className="mt-5 text-ink-500">{t("contact.fromAirportText", { km: settings.hotel.airportDistanceKm, min: settings.hotel.airportDriveMin })}</p>
            <Link href="/contact" className="btn btn-ghost mt-8">{t("nav.contact")}</Link>
          </div>
          <MapEmbed lat={settings.hotel.lat} lng={settings.hotel.lng} address={tr(settings.hotel.address, locale)} directionsUrl={directions} className="aspect-[4/3] sm:aspect-[16/10]" />
        </div>
      </section>
      </>
    ),
    cta: (
      <>
      <section className="relative isolate overflow-hidden py-24 text-center text-white sm:py-32">
        <div className="absolute inset-0 -z-10">
          <Picture image={heroImages[1] ?? hero} locale={locale} fill sizes="100vw" alt="" className="object-cover" />
        </div>
        <div className="absolute inset-0 -z-10 bg-ink-950/65" />
        <div className="container-x max-w-3xl">
          <h2 className="text-5xl leading-[1.02] sm:text-7xl">{txt("ctaTitle", "home.ctaTitle")}</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/85">{txt("ctaText", "home.ctaText")}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BookButton className="btn btn-accent !min-h-14 !px-10 text-base">{t("common.bookNow")}</BookButton>
            <span className="flex items-center gap-2 text-sm text-white/85"><BadgeCheck size={18} aria-hidden /> {t("trust.bestPrice")}</span>
          </div>
        </div>
      </section>
      </>
    ),
  };

  return (
    <>
      <JsonLd
        data={hotelSchema(settings, locale, {
          url: SITE_URL + getPathname({ href: "/", locale }),
          image: hero?.url,
          amenities: amenities.map((a) => tr(a.name, "en")),
          priceRange: prices.length ? `${Math.min(...prices) / 100}–${Math.max(...prices) / 100} GEL` : undefined,
        })}
      />

      {/* ───── Hero (Horizon) ───── */}
      <HorizonHero
        name={txt("heroName", "home.heroName")}
        tagline={txt("heroTagline", "home.heroEyebrow")}
        scrollLabel={t("home.scroll")}
        image={hero}
        mobileImage={heroMobile}
        videoUrl={settings.media.heroVideoUrl || undefined}
        locale={locale}
      />

      {layout.visible.map((id) => <Fragment key={id}>{blocks[id]}</Fragment>)}
    </>
  );
}
