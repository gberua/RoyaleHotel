/**
 * Formats amounts stored in GEL minor units. Hand-rolled (not Intl currency style) so "185 ₾" looks the
 * same in every browser, email and PDF, including environments without Georgian locale data.
 */
export type CurrencyLike = { code: string; symbol: string; rate: number };
export const GEL: CurrencyLike = { code: "GEL", symbol: "₾", rate: 1 };

export function formatMoney(amount: number, cur: CurrencyLike = GEL, locale = "ka", decimals = 0) {
  const value = ((amount / 100) * cur.rate).toFixed(decimals);
  const [int, frac] = value.replace("-", "").split(".");
  const digits = int.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : " ");
  const n = (value.startsWith("-") ? "−" : "") + digits + (frac ? (locale === "en" ? "." : ",") + frac : "");
  if (cur.code === "USD" || (locale === "en" && cur.code !== "GEL")) return `${cur.symbol}${n}`;
  return `${n} ${cur.symbol}`;
}
