"use client";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_REGISTRY, locales, type Locale } from "@/i18n/locales";
import { rememberPlace } from "@/lib/locale-anchor";

/**
 * Language links. They stay real links (crawlers, hreflang, open-in-new-tab), but a plain click switches
 * the language in place: the same page, query and position — see src/lib/locale-anchor.ts.
 */
export function LanguageSwitcher({ tone = "dark", variant = "inline", onSwitch }: {
  tone?: "dark" | "light";
  variant?: "inline" | "list";
  /** e.g. close the menu overlay */
  onSwitch?: () => void;
}) {
  const current = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("nav");
  // Dynamic routes: keep the same params in the other language
  const href = { pathname, params } as unknown as string;

  const switchTo = (l: Locale) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // new tab/window: normal link
    e.preventDefault();
    if (l === current) { onSwitch?.(); return; }
    rememberPlace(); // before closing the menu: the overlay is fixed, the page under it hasn't moved
    onSwitch?.();
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    router.replace({ pathname, params, query } as unknown as string, { locale: l, scroll: false });
  };

  const linkProps = (l: Locale) => ({
    href,
    locale: l,
    hrefLang: LOCALE_REGISTRY[l].hreflang,
    "aria-current": l === current ? ("true" as const) : undefined,
    "data-locale-switch": "",
    onClick: switchTo(l),
  });

  if (variant === "list")
    return (
      <ul className="grid grid-cols-3 gap-2" aria-label={t("language")}>
        {locales.map((l) => (
          <li key={l}>
            <Link
              {...linkProps(l)}
              className={`flex h-12 items-center justify-center rounded-xl border text-sm font-semibold ${l === current ? "border-sea-600 bg-sea-50 text-sea-800" : "border-ink-100 text-ink-700"}`}
            >
              {LOCALE_REGISTRY[l].label}
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <nav aria-label={t("language")} className="flex items-center gap-0.5">
      {locales.map((l) => (
        <Link
          key={l}
          {...linkProps(l)}
          title={LOCALE_REGISTRY[l].label}
          className={`rounded-full px-2 py-1 text-xs font-semibold tracking-wide transition-colors ${
            l === current
              ? tone === "light" ? "bg-white/20 text-white" : "bg-sea-50 text-sea-800"
              : tone === "light" ? "text-white/75 hover:text-white" : "text-ink-500 hover:text-ink-900"
          }`}
        >
          {LOCALE_REGISTRY[l].short}
        </Link>
      ))}
    </nav>
  );
}
