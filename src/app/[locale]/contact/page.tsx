import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rootLocale } from "@/i18n/root-locale";
import { Car, Mail, MapPin, Phone, Plane, TrainFront } from "lucide-react";
import { getSettings, pageCopy } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { contactLinks } from "@/lib/contact";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/ui/PageHero";
import { MapEmbed } from "@/components/ui/MapEmbed";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { ContactForm } from "@/components/forms/ContactForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("contact", locale, t);
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/contact", locale });
}

export default async function ContactPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale });
  const copy = await pageCopy("contact", locale, t);
  const settings = await getSettings();
  const links = contactLinks(settings.contact);
  const address = tr(settings.hotel.address, locale);
  const chat = [
    links.whatsapp && { href: links.whatsapp, name: "whatsapp" as const, label: "WhatsApp", color: "#25D366" },
    links.viber && { href: links.viber, name: "viber" as const, label: "Viber", color: "#7360F2" },
    links.telegram && { href: links.telegram, name: "telegram" as const, label: "Telegram", color: "#229ED9" },
  ].filter(Boolean) as { href: string; name: "whatsapp"; label: string; color: string }[];

  return (
    <>
      <PageHero title={copy.title} intro={copy.intro} locale={locale} />
      <section className="container-x grid gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <div className="space-y-8">
          <ul className="space-y-5">
            <li className="flex gap-4"><MapPin className="mt-1 shrink-0 text-sea-700" aria-hidden /><div><p className="label !mb-0.5">{t("contact.address")}</p><p className="text-lg">{address}</p></div></li>
            <li className="flex gap-4"><Phone className="mt-1 shrink-0 text-sea-700" aria-hidden /><div><p className="label !mb-0.5">{t("contact.phone")}</p><a href={links.tel} className="text-lg font-semibold text-sea-800 underline-offset-4 hover:underline">{settings.contact.phone}</a></div></li>
            <li className="flex gap-4"><Mail className="mt-1 shrink-0 text-sea-700" aria-hidden /><div><p className="label !mb-0.5">{t("contact.email")}</p><a href={links.email} className="text-lg text-sea-800 underline-offset-4 hover:underline">{settings.contact.email}</a></div></li>
          </ul>
          <div className="flex flex-wrap gap-3">
            {chat.map((c) => (
              <a key={c.name} href={c.href} target="_blank" rel="noopener" className="btn btn-ghost">
                <BrandIcon name={c.name} className="h-5 w-5" color={c.color} /> {c.label}
              </a>
            ))}
          </div>
          <MapEmbed lat={settings.hotel.lat} lng={settings.hotel.lng} address={address} directionsUrl={`https://www.google.com/maps/dir/?api=1&destination=${settings.hotel.lat},${settings.hotel.lng}`} className="aspect-[4/3]" />
        </div>
        <div className="rounded-[var(--radius-card)] bg-mist p-6 sm:p-10">
          <h2 className="mb-6 text-4xl leading-none">{t("contact.formTitle")}</h2>
          <ContactForm />
        </div>
      </section>
      <section className="bg-ink-900 py-16 text-white sm:py-20">
        <ul className="container-x grid gap-10 md:grid-cols-3">
          {[
            { icon: Plane, title: t("contact.fromAirport"), text: t("contact.fromAirportText", { km: settings.hotel.airportDistanceKm, min: settings.hotel.airportDriveMin }) },
            { icon: TrainFront, title: t("contact.byTrain"), text: t("contact.byTrainText") },
            { icon: Car, title: t("contact.byCar"), text: t("contact.byCarText", { address }) },
          ].map(({ icon: I, title, text }) => (
            <li key={title}>
              <I size={26} className="text-sea-300" aria-hidden />
              <h2 className="mt-4 text-3xl leading-none">{title}</h2>
              <p className="mt-3 leading-relaxed text-white/75">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
