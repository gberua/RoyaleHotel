"use client";
import { useSyncExternalStore } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const KEY = "rh_consent"; // "all" | "essential"
const GA = process.env.NEXT_PUBLIC_GA4_ID;
const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/** GDPR banner. GA4 / Meta Pixel are only loaded after the visitor accepts. */
const EVENT = "rh:consent-change";
function readConsent() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}
function writeConsent(v: string | null) {
  try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function CookieConsent() {
  const t = useTranslations("cookies");
  // undefined on the server → banner never flashes in the prerendered HTML
  const consent = useSyncExternalStore(subscribe, readConsent, () => undefined);
  const save = (v: "all" | "essential") => writeConsent(v);

  return (
    <>
      {consent === "all" && GA && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {consent === "all" && PIXEL && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');`}
        </Script>
      )}
      {consent === null && (
        <div role="dialog" aria-live="polite" aria-label={t("title")} className="fixed inset-x-3 bottom-3 z-50 rounded-2xl bg-white p-5 shadow-[var(--shadow-lift)] ring-1 ring-ink-100 md:inset-x-auto md:bottom-6 md:left-6 md:max-w-md">
          <p className="font-semibold text-ink-900">{t("title")}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">
            {t("text")}{" "}
            <Link href="/policies/privacy" className="text-sea-700 underline underline-offset-2">{t("policy")}</Link>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => save("all")} className="btn btn-primary !min-h-10 flex-1 !px-4 text-sm">{t("accept")}</button>
            <button type="button" onClick={() => save("essential")} className="btn btn-ghost !min-h-10 flex-1 !px-4 text-sm">{t("reject")}</button>
          </div>
        </div>
      )}
    </>
  );
}

export function CookieSettingsButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => writeConsent(null)} className="inline-flex min-h-10 items-center hover:text-white md:min-h-0">
      {label}
    </button>
  );
}
