import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const NBG_URL = "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=USD,EUR";

/** Official National Bank of Georgia rates: GEL per 1 unit of each currency. */
export async function fetchNbgRates(): Promise<Record<string, number>> {
  const res = await fetch(NBG_URL, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`NBG ${res.status}`);
  const json = (await res.json()) as { currencies: { code: string; quantity: number; rate: number }[] }[];
  const out: Record<string, number> = {};
  for (const c of json[0]?.currencies ?? []) if (c.rate > 0 && c.quantity > 0) out[c.code] = c.rate / c.quantity;
  if (!out.USD || !out.EUR) throw new Error("NBG response without USD/EUR");
  return out;
}

/**
 * Stores NBG rates. Our Currency.rate is "units of this currency per 1 GEL", i.e. 1 / (GEL per unit).
 * Returns old → new for the activity log.
 */
export async function updateRatesFromNbg(userId: string | null) {
  const gelPer = await fetchNbgRates();
  const before = await db.currency.findMany({ where: { code: { in: Object.keys(gelPer) } } });
  const changes: Record<string, { old: string; new: string }> = {};
  for (const [code, perUnit] of Object.entries(gelPer)) {
    const rate = new Prisma.Decimal(1 / perUnit).toDecimalPlaces(6);
    const old = before.find((c) => c.code === code);
    if (!old) continue;
    await db.currency.update({ where: { code }, data: { rate } });
    changes[code] = { old: old.rate.toString(), new: rate.toString() };
  }
  const row = await db.setting.findUnique({ where: { key: "currency" } });
  const value = { ...((row?.value as object) ?? {}), lastUpdatedAt: new Date().toISOString() };
  await db.setting.upsert({ where: { key: "currency" }, create: { key: "currency", value }, update: { value } });
  await db.activityLog.create({
    data: { userId, action: "currency.nbg", entity: "Currency", summary: `Exchange rates updated from the National Bank of Georgia (USD ${gelPer.USD.toFixed(4)} ₾, EUR ${gelPer.EUR.toFixed(4)} ₾)`, before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.old])), after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.new])) },
  });
  return gelPer;
}
