import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { locale as rawLocale } from "next/root-params";
import "../globals.css";
import { fontVariables, DISPLAY_FONT_STRETCH } from "@/config/fonts";
import { LOCALE_REGISTRY, isLocale, locales } from "@/i18n/locales";
import { getCurrencies, getHeroImages, getMediaByCategory, getSettings, type Img } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { contactLinks } from "@/lib/contact";
import { SITE_URL } from "@/lib/seo";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ContactDock } from "@/components/layout/ContactDock";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { PreviewBanner } from "@/components/layout/PreviewBanner";
import { RevealObserver } from "@/components/layout/RevealObserver";
import { ScrollManager } from "@/components/layout/ScrollManager";
import { CurrencyProvider } from "@/components/layout/CurrencyProvider";
import { BookingDrawerProvider } from "@/components/booking/BookingDrawerProvider";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const REVEAL_BOOT = `(function(d,w){if(!("IntersectionObserver" in w))return;d.classList.add("js-reveal");var off=function(){if(!w.__reveal)d.classList.remove("js-reveal")};w.addEventListener("load",function(){setTimeout(off,2500)});setTimeout(off,12000)})(document.documentElement,window)`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("meta.defaultTitle"), template: `%s · ${t("meta.siteName")}` },
    description: t("meta.defaultDescription"),
    applicationName: t("meta.siteName"),
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const raw = await rawLocale();
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const [messages, settings, currencies, hero, rooms, pool, beach, exterior, kobuleti, view, lobby] = await Promise.all([
    getMessages(), getSettings(), getCurrencies(), getHeroImages(),
    ...["room", "pool", "beach", "exterior", "kobuleti", "view", "lobby"].map((c) => getMediaByCategory(c, 2)),
  ]);
  const links = contactLinks(settings.contact);
  const pick = (img?: Img) => (img ? { url: img.url, blur: img.blurDataUrl } : null);
  // The full-screen menu shows a photo for each link
  const menuImages = {
    home: pick(hero[0]), rooms: pick(rooms[0]), amenities: pick(pool[0]), offers: pick(beach[0]),
    gallery: pick(exterior[0]), kobuleti: pick(kobuleti[0]), reviews: pick(view[0]), contact: pick(lobby[0] ?? exterior[1]),
  };

  return (
    <html
      suppressHydrationWarning
      lang={locale}
      dir={LOCALE_REGISTRY[locale].dir}
      className={fontVariables}
      style={{ ["--display-stretch" as string]: DISPLAY_FONT_STRETCH }}
    >
      <head>
        {/* Scroll reveals: hide-until-revealed is switched on only when the browser can reveal (IntersectionObserver);
            if the page's JavaScript hasn't taken over 2.5 s after the page loaded (or 12 s at most), everything is shown. */}
        <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOT }} />
      </head>
      <body className="min-h-svh">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <CurrencyProvider currencies={currencies}>
            <BookingDrawerProvider>
              <SiteHeader
                menuImages={menuImages}
                contact={{
                  phone: settings.contact.phone, tel: links.tel, email: settings.contact.email, address: tr(settings.hotel.address, locale),
                  whatsapp: links.whatsapp, viber: links.viber, telegram: links.telegram, instagram: settings.contact.instagram, facebook: settings.contact.facebook,
                }}
              />
              <main id="main">{children}</main>
              <SiteFooter locale={locale} />
              <ContactDock links={links} />
              <CookieConsent />
              <RevealObserver />
              <ScrollManager />
              <Suspense><PreviewBanner /></Suspense>
            </BookingDrawerProvider>
          </CurrencyProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
