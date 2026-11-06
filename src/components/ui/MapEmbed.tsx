"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Navigation } from "lucide-react";

/** Click-to-load Google map: keeps the page fast (Lighthouse) and loads Google only on request (GDPR). */
export function MapEmbed({ lat, lng, address, directionsUrl, className = "" }: { lat: number; lng: number; address: string; directionsUrl: string; className?: string }) {
  const t = useTranslations("common");
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] bg-foam ${className}`}>
      {loaded ? (
        <iframe
          title={address}
          src={`https://maps.google.com/maps?q=${lat},${lng}&z=16&hl=en&output=embed`}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <div className="absolute inset-0">
          {/* stylised map backdrop — no external requests */}
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 500" aria-hidden>
            <rect width="800" height="500" fill="#e9f5f3" />
            <path d="M0 0 H260 C 240 120 290 260 250 500 H0 Z" fill="#a7e1dd" />
            <path d="M0 0 H200 C 185 140 225 270 190 500 H0 Z" fill="#6fcdc8" opacity=".55" />
            {[80, 170, 260, 350, 440].map((y) => <path key={y} d={`M270 ${y} L800 ${y + 30}`} stroke="#fff" strokeWidth="10" />)}
            <path d="M330 0 L360 500" stroke="#fff" strokeWidth="16" />
            {[470, 610, 740].map((x) => <path key={x} d={`M${x} 0 L${x - 30} 500`} stroke="#fff" strokeWidth="8" />)}
          </svg>
          <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-full">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-sea-700 text-white shadow-[var(--shadow-lift)] ring-8 ring-sea-500/20"><MapPin size={22} aria-hidden /></span>
          </div>
          <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2 rounded-2xl bg-white/95 p-4 shadow-[var(--shadow-soft)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-ink-900">{address}</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setLoaded(true)} className="btn btn-ghost !min-h-10 !px-4 text-sm">{t("showMap")}</button>
              <a href={directionsUrl} target="_blank" rel="noopener" className="btn btn-primary !min-h-10 !px-4 text-sm"><Navigation size={16} aria-hidden /> {t("directions")}</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
