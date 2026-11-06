"use client";
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useLocale } from "next-intl";

type Currency = { code: string; symbol: string; rate: number; isBase: boolean };
type Ctx = { currencies: Currency[]; code: string; setCode: (c: string) => void };
const CurrencyContext = createContext<Ctx | null>(null);

const KEY = "rh_currency";
const listeners = new Set<() => void>();
function read() {
  try { return localStorage.getItem(KEY) ?? "GEL"; } catch { return "GEL"; }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}

export function CurrencyProvider({ currencies, children }: { currencies: Currency[]; children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, read, () => "GEL");
  const code = currencies.some((c) => c.code === stored) ? stored : "GEL";
  const setCode = useCallback((c: string) => {
    try { localStorage.setItem(KEY, c); } catch {}
    listeners.forEach((l) => l());
  }, []);
  return <CurrencyContext.Provider value={{ currencies, code, setCode }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency outside CurrencyProvider");
  return ctx;
}

import { formatMoney } from "@/lib/money";
export { formatMoney };

export function useFormatPrice() {
  const { currencies, code } = useCurrency();
  const locale = useLocale();
  const cur = currencies.find((c) => c.code === code) ?? { code: "GEL", symbol: "₾", rate: 1, isBase: true };
  return (amount: number) => formatMoney(amount, cur, locale);
}

export function Price({ amount, className }: { amount: number; className?: string }) {
  const format = useFormatPrice();
  return <span className={className} suppressHydrationWarning>{format(amount)}</span>;
}

export function CurrencySelect({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const { currencies, code, setCode } = useCurrency();
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">Currency</span>
      <select
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className={`cursor-pointer appearance-none rounded-full bg-transparent py-1.5 pl-3 pr-3 text-sm font-semibold ${tone === "light" ? "text-white [&>option]:text-ink-900" : "text-ink-900"}`}
      >
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
        ))}
      </select>
    </label>
  );
}
