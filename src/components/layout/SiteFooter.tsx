import { getTranslations } from "next-intl/server";
import { Mail, MapPin, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentYear, getPage, getPolicies, getSettings } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { contactLinks } from "@/lib/contact";
import { Logo } from "./Logo";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { CookieSettingsButton } from "./CookieConsent";
import { BookButton } from "@/components/booking/BookButton";
import { Stars } from "@/components/ui/Stars";

const HEADING = "mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-sea-300 md:mb-4";
/** Phones: links are 40px tall touch targets stacked without extra gap; long labels wrap inside their column (any language). */
const LIST = "text-sm md:space-y-2.5";
const LINK = "block min-w-0 py-2.5 leading-5 break-words [hyphens:auto] hover:text-white md:py-0";

export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale });
  const [settings, policies, footer] = await Promise.all([getSettings(), getPolicies(), getPage("footer")]);
  const links = contactLinks(settings.contact);
  const year = await getCurrentYear();

  return (
    <footer className="bg-ink-900 pb-10 text-white/75">
      <div className="container-x grid grid-cols-1 gap-x-6 gap-y-10 py-12 min-[340px]:grid-cols-2 md:gap-12 md:py-16 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="min-w-0 space-y-5 min-[340px]:col-span-2 md:col-span-1">
          <Logo tone="light" />
          <p className="max-w-xs text-sm leading-relaxed">{tr(footer.sections.tagline, locale) || t("footer.tagline")}</p>
          <div className="flex items-center gap-2 text-sm">
            <Stars value={settings.trust.googleRating} size={14} />
            <span className="text-white">{settings.trust.googleRating.toFixed(1)}</span>
            <span>· {t("trust.reviewsCount", { count: settings.trust.googleReviewCount })} · Google</span>
          </div>
          <div className="flex gap-2">
            {settings.contact.instagram && (
              <a href={settings.contact.instagram} target="_blank" rel="noopener" aria-label="Instagram" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                <BrandIcon name="instagram" className="h-4 w-4" />
              </a>
            )}
            {settings.contact.facebook && (
              <a href={settings.contact.facebook} target="_blank" rel="noopener" aria-label="Facebook" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                <BrandIcon name="facebook" className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <nav aria-label={t("footer.explore")} className="min-w-0">
          <p className={HEADING}>{t("footer.explore")}</p>
          <ul className={LIST}>
            {(["rooms", "amenities", "offers", "gallery", "kobuleti", "reviews"] as const).map((k) => (
              <li key={k}><Link href={`/${k}`} className={LINK}>{t(`nav.${k}`)}</Link></li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("footer.guests")} className="min-w-0">
          <p className={HEADING}>{t("footer.guests")}</p>
          <ul className={LIST}>
            <li><BookButton className={`${LINK} text-start`}>{t("common.bookNow")}</BookButton></li>
            <li><Link href="/booking/manage" className={LINK}>{t("nav.manageBooking")}</Link></li>
            <li><Link href="/faq" className={LINK}>{t("nav.faq")}</Link></li>
            {policies.map((p) => (
              <li key={p.slug}><Link href={`/policies/${p.slug}`} className={LINK}>{tr(p.title, locale)}</Link></li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 min-[340px]:col-span-2 md:col-span-1">
          <p className={HEADING}>{t("footer.contact")}</p>
          <ul className="space-y-1 text-sm md:space-y-3">
            <li className="flex gap-3 py-2.5 md:py-0"><MapPin size={18} className="mt-0.5 shrink-0 text-sea-300" aria-hidden /><span className="min-w-0 break-words">{tr(settings.hotel.address, locale)}</span></li>
            <li className="flex items-center gap-3"><Phone size={18} className="shrink-0 text-sea-300" aria-hidden /><a href={links.tel} className={LINK}>{settings.contact.phone}</a></li>
            <li className="flex items-center gap-3"><Mail size={18} className="shrink-0 text-sea-300" aria-hidden /><a href={links.email} className={`${LINK} [overflow-wrap:anywhere]`}>{settings.contact.email}</a></li>
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 md:mt-8 md:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sea-300 md:mb-3">{t("footer.payments")}</p>
            <div className="flex items-center gap-3 text-white/80">
              <BrandIcon name="visa" className="h-6 w-10" />
              <BrandIcon name="mastercard" className="h-6 w-8" />
              <span className="rounded border border-white/25 px-2 py-0.5 text-[0.7rem] font-semibold">{t("trust.securePayment")}</span>
            </div>
          </div>
        </div>
      </div>
      {/* Keep the last row clear of the floating chat button at the bottom-right (phones 3rem + 1rem, md+ 3.5rem + 1.5rem) */}
      <div className="container-x flex flex-col gap-3 border-t border-white/10 pe-[calc(1rem+4rem)] pt-6 text-xs sm:flex-row sm:items-center sm:justify-between md:pe-[calc(1.5rem+5rem)] 2xl:pe-6">
        <p>{t("footer.rights", { year })}</p>
        <div className="flex flex-wrap gap-x-5">
          <Link href="/policies/privacy" className="inline-flex min-h-10 items-center hover:text-white md:min-h-0">{t("footer.privacy")}</Link>
          <CookieSettingsButton label={t("footer.cookies")} />
        </div>
      </div>
    </footer>
  );
}
