"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, X } from "lucide-react";
import { BookingFlow } from "./BookingFlow";

type Props = { open: boolean; preselect: string | null; onClose: () => void };

/** Right-side drawer (full-screen sheet on phones) hosting the booking flow. Stays mounted so progress persists. */
export default function BookingDrawer({ open, preselect, onClose }: Props) {
  const t = useTranslations();
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const f = requestAnimationFrame(() => closeBtn.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]');
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(f); html.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-[70] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open} inert={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0"}`} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-drawer-title"
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-[var(--shadow-lift)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] motion-reduce:duration-300 sm:max-w-[42rem] ${open ? "translate-x-0 opacity-100" : "translate-x-full motion-reduce:translate-x-0 motion-reduce:opacity-0"}`}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 sm:px-8">
          <h2 id="booking-drawer-title" className="text-[2.1rem] leading-none">{t("drawer.title")}</h2>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label={t("drawer.close")} className="grid h-11 w-11 place-items-center rounded-full hover:bg-mist">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-5 sm:px-8">
          <BookingFlow preselect={preselect} compact />
        </div>
        <div className="border-t border-ink-100 bg-mist/60 px-5 py-3 text-xs text-ink-700 sm:px-8">
          <p className="flex items-start gap-2"><BadgeCheck size={16} className="shrink-0 text-sea-700" aria-hidden />{t("trust.bestPrice")} · {t("drawer.priceNote")}</p>
        </div>
      </div>
    </div>
  );
}
