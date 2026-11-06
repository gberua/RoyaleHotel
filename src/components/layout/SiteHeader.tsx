"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { CurrencySelect } from "./CurrencyProvider";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { BookButton } from "@/components/booking/BookButton";

export type MenuImage = { url: string; blur: string | null } | null;

/** Main navigation, in the order shown in the full-screen menu. */
export const NAV = [
  { href: "/", key: "home" },
  { href: "/rooms", key: "rooms" },
  { href: "/amenities", key: "amenities" },
  { href: "/offers", key: "offers" },
  { href: "/gallery", key: "gallery" },
  { href: "/kobuleti", key: "kobuleti" },
  { href: "/reviews", key: "reviews" },
  { href: "/contact", key: "contact" },
] as const;

/** Routes that open with a full-bleed photo: the header starts transparent with white text. */
const OVERLAY = new Set(["/", "/rooms", "/amenities", "/offers", "/gallery", "/kobuleti"]);
export const isOverlayRoute = (path: string) => OVERLAY.has(path) || /^\/offers\/[^/]+$/.test(path);

type Props = {
  contact: { phone: string; tel: string; email: string; address: string; whatsapp: string | null; viber: string | null; telegram: string | null; instagram: string; facebook: string };
  menuImages: Record<string, MenuImage>;
};

export function SiteHeader({ contact, menuImages }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const isOverlay = isOverlayRoute(pathname);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [active, setActive] = useState<string>("home");
  const menuBtn = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close on route change (render-time state sync — no effect needed)
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); menuBtn.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const f = requestAnimationFrame(() => overlay.current?.querySelector<HTMLElement>("a")?.focus());
    return () => { html.style.overflow = ""; window.removeEventListener("keydown", onKey); cancelAnimationFrame(f); };
  }, [open]);

  const toggle = () => {
    setEverOpened(true);
    setOpen((v) => !v);
  };

  const light = isOverlay && !scrolled && !open;
  const chat = [
    contact.whatsapp && { href: contact.whatsapp, name: "whatsapp" as const, label: "WhatsApp" },
    contact.viber && { href: contact.viber, name: "viber" as const, label: "Viber" },
    contact.telegram && { href: contact.telegram, name: "telegram" as const, label: "Telegram" },
    contact.instagram && { href: contact.instagram, name: "instagram" as const, label: "Instagram" },
    contact.facebook && { href: contact.facebook, name: "facebook" as const, label: "Facebook" },
  ].filter(Boolean) as { href: string; name: "whatsapp"; label: string }[];

  return (
    <>
      <a href="#main" className="sr-only z-[80] rounded bg-white px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t("nav.skipToContent")}
      </a>

      <header
        className={`fixed inset-x-0 top-0 z-[65] transition-[background-color,box-shadow] duration-500 ease-[var(--ease-out-soft)] ${
          open ? "bg-white" : light ? "bg-gradient-to-b from-ink-950/35 to-transparent" : "bg-white/95 shadow-[0_8px_30px_-14px_rgb(11_46_58/0.22)] backdrop-blur-md"
        }`}
      >
        <div className={`container-x relative flex items-center justify-between transition-[height] duration-500 ease-[var(--ease-out-soft)] ${scrolled && !open ? "h-16" : "h-20"}`}>
          {/* Left — menu */}
          <button
            ref={menuBtn}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls="site-menu"
            className={`group flex h-11 items-center gap-3 text-[0.8rem] font-semibold uppercase tracking-[0.2em] transition-colors ${light ? "text-white" : "text-ink-900"}`}
          >
            <span className="relative block h-3 w-7" aria-hidden>
              <span className={`absolute left-0 h-px bg-current transition-all duration-500 ${open ? "top-1.5 w-7 rotate-45" : "top-0 w-7 group-hover:w-5"}`} />
              <span className={`absolute left-0 h-px bg-current transition-all duration-500 ${open ? "top-1.5 w-7 -rotate-45" : "top-3 w-5 group-hover:w-7"}`} />
            </span>
            <span className="max-sm:sr-only">{open ? t("nav.menuClose") : t("nav.menuOpen")}</span>
          </button>

          {/* Center — logo */}
          <Link href="/" className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-500 ease-[var(--ease-out-soft)] ${scrolled && !open ? "scale-[0.84]" : ""}`}>
            <Logo tone={light ? "light" : "dark"} />
          </Link>

          {/* Right — language + book */}
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden sm:block"><LanguageSwitcher tone={light ? "light" : "dark"} /></div>
            <BookButton className="btn btn-accent !min-h-9 !px-3.5 text-[0.8rem] sm:!min-h-10 sm:!px-6 sm:text-sm">{t("nav.book")}</BookButton>
          </div>
        </div>
      </header>

      {/* Full-screen menu */}
      <div
        id="site-menu"
        ref={overlay}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.menu")}
        inert={!open}
        className={`fixed inset-0 z-[60] overflow-y-auto bg-white transition-[opacity,visibility] duration-500 ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <div className="container-x grid min-h-full gap-10 pb-10 pt-24 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pb-10">
          <div className="flex flex-col">
            <nav aria-label="Main">
              <ol>
                {NAV.map((item, i) => {
                  const current = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li
                      key={item.key}
                      className={`transition-[opacity,transform] duration-700 ease-[var(--ease-out-soft)] ${open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
                      style={{ transitionDelay: open ? `${120 + i * 55}ms` : "0ms" }}
                    >
                      <Link
                        href={item.href}
                        onMouseEnter={() => setActive(item.key)}
                        onFocus={() => setActive(item.key)}
                        aria-current={current ? "page" : undefined}
                        className="group flex items-baseline gap-4 py-1"
                      >
                        <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-ink-300" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                        <span className={`font-display text-[clamp(2.1rem,min(6.2vw,6.4svh),4.4rem)] leading-[1.06] transition-colors duration-300 ${current ? "text-sea-700" : "text-ink-900 group-hover:text-sea-700"}`}>
                          {t(`nav.${item.key}`)}
                        </span>
                        <span className="hidden h-px flex-1 origin-left scale-x-0 self-center bg-sea-500 transition-transform duration-500 group-hover:scale-x-100 sm:block" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <div
              className={`mt-auto grid gap-8 pt-10 transition-[opacity,transform] duration-700 sm:grid-cols-2 ${open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
              style={{ transitionDelay: open ? `${160 + NAV.length * 55}ms` : "0ms" }}
            >
              <ul className="space-y-2.5 text-sm text-ink-700">
                <li className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-sea-700" aria-hidden />{contact.address}</li>
                <li className="flex gap-3"><Phone size={17} className="mt-0.5 shrink-0 text-sea-700" aria-hidden /><a href={contact.tel} className="hover:text-sea-700">{contact.phone}</a></li>
                <li className="flex gap-3"><Mail size={17} className="mt-0.5 shrink-0 text-sea-700" aria-hidden /><a href={`mailto:${contact.email}`} className="hover:text-sea-700">{contact.email}</a></li>
              </ul>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {chat.map((c) => (
                    <a key={c.name} href={c.href} target="_blank" rel="noopener" aria-label={c.label} className="grid h-11 w-11 place-items-center rounded-full border border-ink-100 text-ink-900 transition-colors hover:border-sea-500 hover:text-sea-700">
                      <BrandIcon name={c.name} className="h-[18px] w-[18px]" />
                    </a>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <LanguageSwitcher />
                  <CurrencySelect />
                </div>
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-500">
                  <li><Link href="/faq" className="hover:text-ink-900">{t("nav.faq")}</Link></li>
                  <li><Link href="/booking/manage" className="hover:text-ink-900">{t("nav.manageBooking")}</Link></li>
                  <li><Link href="/policies/check-in" className="hover:text-ink-900">{t("nav.policies")}</Link></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Image that follows the hovered link (desktop only; images load on first open) */}
          <div
            className={`relative hidden overflow-hidden rounded-[var(--radius-card)] bg-mist transition-[opacity,clip-path] duration-1000 ease-[var(--ease-out-soft)] lg:block ${open ? "opacity-100 [clip-path:inset(0_0_0_0)]" : "opacity-0 [clip-path:inset(0_0_100%_0)]"}`}
          >
            {everOpened &&
              NAV.map((item) => {
                const img = menuImages[item.key];
                if (!img) return null;
                return (
                  <Image
                    key={item.key}
                    src={img.url}
                    alt=""
                    fill
                    sizes="40vw"
                    placeholder={img.blur ? "blur" : "empty"}
                    blurDataURL={img.blur ?? undefined}
                    className={`object-cover transition-[opacity,transform] duration-700 ease-[var(--ease-out-soft)] ${active === item.key ? "scale-100 opacity-100" : "scale-105 opacity-0"}`}
                  />
                );
              })}
            <Link href="/rooms" tabIndex={-1} className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-ink-900 backdrop-blur">
              {t("common.viewAllRooms")} <ArrowUpRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
