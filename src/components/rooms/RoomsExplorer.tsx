"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { useCurrency } from "@/components/layout/CurrencyProvider";

export type RoomFilterItem = { id: string; maxOccupancy: number; view: string | null; slug: string; price: number };

/** Client-side filters (guests, view, type, price). Cards are rendered on the server and passed in. */
export function RoomsExplorer({ items, cards, typeNames }: { items: RoomFilterItem[]; cards: Record<string, ReactNode>; typeNames: Record<string, string> }) {
  const t = useTranslations("rooms");
  const { currencies, code } = useCurrency();
  const rate = currencies.find((c) => c.code === code)?.rate ?? 1;
  const [guests, setGuests] = useState(0);
  const [view, setView] = useState("");
  const [type, setType] = useState("");
  const [maxPrice, setMaxPrice] = useState(0);
  const views = [...new Set(items.map((i) => i.view).filter(Boolean))] as string[];
  const priceSteps = useMemo(() => [...new Set(items.map((i) => Math.ceil((i.price / 100) * rate / 50) * 50))].sort((a, b) => a - b), [items, rate]);

  const visible = items.filter(
    (i) =>
      (!guests || i.maxOccupancy >= guests) &&
      (!view || i.view === view || (view === "sea" && i.view === "partial_sea")) &&
      (!type || i.slug === type) &&
      (!maxPrice || (i.price / 100) * rate <= maxPrice),
  );
  const active = guests || view || type || maxPrice;
  const select = "field !w-auto !min-h-11 cursor-pointer !py-2 text-sm font-semibold";

  return (
    <div>
      <div className="sticky top-[var(--header-h)] z-20 -mx-4 mb-8 border-b border-ink-100 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="no-scrollbar flex min-w-0 max-w-full items-center gap-2 overflow-x-auto">
          <SlidersHorizontal size={18} className="shrink-0 text-sea-700" aria-label={t("filters")} />
          <label className="shrink-0"><span className="sr-only">{t("filterGuests")}</span>
            <select className={select} value={guests} onChange={(e) => setGuests(+e.target.value)}>
              <option value={0}>{t("filterGuests")}: {t("any")}</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t("filterGuests")}: {n}+</option>)}
            </select>
          </label>
          <label className="shrink-0"><span className="sr-only">{t("filterView")}</span>
            <select className={select} value={view} onChange={(e) => setView(e.target.value)}>
              <option value="">{t("filterView")}: {t("any")}</option>
              {views.map((v) => <option key={v} value={v}>{t(`view.${v as "sea"}`)}</option>)}
            </select>
          </label>
          <label className="shrink-0"><span className="sr-only">{t("filterType")}</span>
            <select className={select} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t("filterType")}: {t("any")}</option>
              {items.map((i) => <option key={i.slug} value={i.slug}>{typeNames[i.slug]}</option>)}
            </select>
          </label>
          <label className="shrink-0"><span className="sr-only">{t("filterPrice")}</span>
            <select className={select} value={maxPrice} onChange={(e) => setMaxPrice(+e.target.value)}>
              <option value={0}>{t("filterPrice")}: {t("any")}</option>
              {priceSteps.map((p) => <option key={p} value={p}>≤ {p} {code}</option>)}
            </select>
          </label>
          {active ? (
            <button type="button" onClick={() => { setGuests(0); setView(""); setType(""); setMaxPrice(0); }} className="flex shrink-0 items-center gap-1 px-2 text-sm font-semibold text-sea-800">
              <X size={14} aria-hidden /> {t("clear")}
            </button>
          ) : null}
        </div>
      </div>
      <p className="mb-5 text-sm text-ink-500" aria-live="polite">{t("results", { count: visible.length })}</p>
      {visible.length ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((i) => <li key={i.id}>{cards[i.id]}</li>)}
        </ul>
      ) : (
        <p className="rounded-2xl bg-mist p-8 text-ink-700">{t("noResults")}</p>
      )}
    </div>
  );
}
