"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Phone, X } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { BookButton } from "@/components/booking/BookButton";
import { isOverlayRoute } from "./SiteHeader";

type Links = { tel: string; whatsapp: string | null; viber: string | null; telegram: string | null };

const channels = [
  { key: "whatsapp", color: "#25D366" },
  { key: "viber", color: "#7360F2" },
  { key: "telegram", color: "#229ED9" },
] as const;

/**
 * Floating actions.
 * • Chat (WhatsApp / Viber / Telegram / call) — bottom-right, on every page.
 * • Mobile only: a small "Book" pill, bottom-centre, once the visitor scrolls past the hero.
 * Hidden inside the booking flow to keep it distraction-free.
 */
export function ContactDock({ links }: { links: Links }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const overlay = isOverlayRoute(pathname);

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > (overlay ? window.innerHeight * 0.8 : 320));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  if (pathname.startsWith("/book")) return null;
  const available = channels.filter((c) => links[c.key]);
  const visible = pastHero || open;

  return (
    <>
      {open && <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink-950/20 md:bg-transparent" />}

      {/* Chat */}
      <div
        className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-2 transition-[opacity,transform] duration-500 md:bottom-6 md:right-6 ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0 md:pointer-events-auto md:translate-y-0 md:opacity-100"
        }`}
      >
        {open && (
          <ul className="flex flex-col items-end gap-2">
            {available.map((c, i) => (
              <li key={c.key} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms`, animationDuration: "0.4s" }}>
                <a href={links[c.key]!} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-full bg-white py-2 pl-2 pr-5 text-sm font-semibold text-ink-900 shadow-[var(--shadow-lift)]">
                  <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: c.color }}>
                    <BrandIcon name={c.key} className="h-5 w-5" color="#fff" />
                  </span>
                  {t(`floating.${c.key}`)}
                </a>
              </li>
            ))}
            <li className="animate-fade-up" style={{ animationDelay: `${available.length * 50}ms`, animationDuration: "0.4s" }}>
              <a href={links.tel} className="flex items-center gap-3 rounded-full bg-white py-2 pl-2 pr-5 text-sm font-semibold text-ink-900 shadow-[var(--shadow-lift)]">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-white"><Phone size={18} aria-hidden /></span>
                {t("floating.call")}
              </a>
            </li>
          </ul>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t("common.close") : t("floating.contactUs")}
          className="grid h-12 w-12 place-items-center rounded-full bg-[#25D366] text-white shadow-[var(--shadow-lift)] transition-transform hover:scale-105 md:h-14 md:w-14"
        >
          {open ? <X size={22} /> : <BrandIcon name="whatsapp" className="h-6 w-6 md:h-7 md:w-7" />}
        </button>
      </div>

      {/* Mobile Book pill */}
      <div
        className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 transition-[opacity,transform] duration-500 ease-[var(--ease-out-soft)] md:hidden ${
          pastHero && !open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        }`}
        inert={!pastHero || open}
      >
        <BookButton className="btn btn-accent !min-h-12 px-9 shadow-[0_14px_30px_-12px_rgb(7_31_39/0.45)]">{t("nav.book")}</BookButton>
      </div>
    </>
  );
}
