"use client";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_REGISTRY, locales } from "@/i18n/locales";

export function LanguageSwitcher({ tone = "dark", variant = "inline" }: { tone?: "dark" | "light"; variant?: "inline" | "list" }) {
  const current = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const t = useTranslations("nav");
  // Dynamic routes: keep the same params in the other language
  const href = { pathname, params } as unknown as string;

  if (variant === "list")
    return (
      <ul className="grid grid-cols-3 gap-2" aria-label={t("language")}>
        {locales.map((l) => (
          <li key={l}>
            <Link
              href={href}
              locale={l}
              hrefLang={LOCALE_REGISTRY[l].hreflang}
              aria-current={l === current ? "true" : undefined}
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
          href={href}
          locale={l}
          hrefLang={LOCALE_REGISTRY[l].hreflang}
          aria-current={l === current ? "true" : undefined}
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
