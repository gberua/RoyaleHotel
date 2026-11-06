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

export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale });
  const [settings, policies, footer] = await Promise.all([getSettings(), getPolicies(), getPage("footer")]);
  const links = contactLinks(settings.contact);
  const year = await getCurrentYear();

  return (
    <footer className="bg-ink-900 pb-24 text-white/75 md:pb-10">
      <div className="container-x grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="space-y-5">
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

        <nav aria-label={t("footer.explore")}>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-sea-300">{t("footer.explore")}</p>
          <ul className="space-y-2.5 text-sm">
            {(["rooms", "amenities", "offers", "gallery", "kobuleti", "reviews"] as const).map((k) => (
              <li key={k}><Link href={`/${k}`} className="hover:text-white">{t(`nav.${k}`)}</Link></li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("footer.guests")}>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-sea-300">{t("footer.guests")}</p>
          <ul className="space-y-2.5 text-sm">
            <li><BookButton className="hover:text-white">{t("common.bookNow")}</BookButton></li>
            <li><Link href="/booking/manage" className="hover:text-white">{t("nav.manageBooking")}</Link></li>
            <li><Link href="/faq" className="hover:text-white">{t("nav.faq")}</Link></li>
            {policies.map((p) => (
              <li key={p.slug}><Link href={`/policies/${p.slug}`} className="hover:text-white">{tr(p.title, locale)}</Link></li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-sea-300">{t("footer.contact")}</p>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-sea-300" aria-hidden /><span>{tr(settings.hotel.address, locale)}</span></li>
            <li className="flex gap-3"><Phone size={18} className="mt-0.5 shrink-0 text-sea-300" aria-hidden /><a href={links.tel} className="hover:text-white">{settings.contact.phone}</a></li>
            <li className="flex gap-3"><Mail size={18} className="mt-0.5 shrink-0 text-sea-300" aria-hidden /><a href={links.email} className="hover:text-white">{settings.contact.email}</a></li>
          </ul>
          <p className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-sea-300">{t("footer.payments")}</p>
          <div className="flex items-center gap-3 text-white/80">
            <BrandIcon name="visa" className="h-6 w-10" />
            <BrandIcon name="mastercard" className="h-6 w-8" />
            <span className="rounded border border-white/25 px-2 py-0.5 text-[0.7rem] font-semibold">{t("trust.securePayment")}</span>
          </div>
        </div>
      </div>
      <div className="container-x flex flex-col gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>{t("footer.rights", { year })}</p>
        <div className="flex gap-5">
          <Link href="/policies/privacy" className="hover:text-white">{t("footer.privacy")}</Link>
          <CookieSettingsButton label={t("footer.cookies")} />
        </div>
      </div>
    </footer>
  );
}
