/**
 * Rate management — PURE functions (unit-tested): the effective rate grid and bulk changes with preview.
 * Bulk changes write date overrides; they never touch existing bookings (bookings store their own nightly prices).
 */
import { addDaysIso, eachNight, toDate } from "./dates";
import { checkRestrictions, nightlyPrices, seasonFor, type RateOverride, type RateRoomType, type RateSeason } from "./engine";

/** Monday = 0 … Sunday = 6 */
export const weekdayOf = (iso: string) => (toDate(iso).getUTCDay() + 6) % 7;

export type BulkOp =
  | { kind: "set"; price: number }
  | { kind: "percent"; value: number } // +15 = 15 % more, -10 = 10 % less
  | { kind: "amount"; value: number } // tetri, may be negative
  | { kind: "minStay"; value: number | null }
  | { kind: "close" }
  | { kind: "open" }
  | { kind: "closedToArrival"; value: boolean }
  | { kind: "clear" };

export type BulkChange = {
  roomTypeId: string; date: string;
  oldPrice: number; newPrice: number;
  oldMinStay: number | null; newMinStay: number | null;
  oldClosed: boolean; newClosed: boolean;
  oldCta: boolean; newCta: boolean;
};

const roundGel = (tetri: number) => Math.max(0, Math.round(tetri / 100) * 100);

export function bulkPlan(args: {
  roomTypes: RateRoomType[]; seasons: RateSeason[]; overrides: RateOverride[];
  roomTypeIds: string[]; from: string; to: string; weekdays: number[]; op: BulkOp;
}): BulkChange[] {
  const dates = eachNight(args.from, addDaysIso(args.to, 1)).filter((d) => args.weekdays.includes(weekdayOf(d)));
  const changes: BulkChange[] = [];
  for (const rt of args.roomTypes.filter((r) => args.roomTypeIds.includes(r.id))) {
    const ov = new Map(args.overrides.filter((o) => o.roomTypeId === rt.id).map((o) => [o.date, o]));
    for (const date of dates) {
      const o = ov.get(date);
      const oldPrice = nightlyPrices(rt, args.seasons, args.overrides, date, addDaysIso(date, 1))[0].price;
      const withoutOverride = nightlyPrices(rt, args.seasons, [], date, addDaysIso(date, 1))[0].price;
      const c: BulkChange = {
        roomTypeId: rt.id, date, oldPrice, newPrice: oldPrice,
        oldMinStay: o?.minStay ?? null, newMinStay: o?.minStay ?? null,
        oldClosed: !!o?.closed, newClosed: !!o?.closed, oldCta: !!o?.closedToArrival, newCta: !!o?.closedToArrival,
      };
      switch (args.op.kind) {
        case "set": c.newPrice = Math.max(0, args.op.price); break;
        case "percent": c.newPrice = roundGel(oldPrice * (1 + args.op.value / 100)); break;
        case "amount": c.newPrice = Math.max(0, oldPrice + args.op.value); break;
        case "minStay": c.newMinStay = args.op.value; break;
        case "close": c.newClosed = true; break;
        case "open": c.newClosed = false; c.newCta = false; break;
        case "closedToArrival": c.newCta = args.op.value; break;
        case "clear": c.newPrice = withoutOverride; c.newMinStay = null; c.newClosed = false; c.newCta = false; break;
      }
      if (c.newPrice !== c.oldPrice || c.newMinStay !== c.oldMinStay || c.newClosed !== c.oldClosed || c.newCta !== c.oldCta) changes.push(c);
    }
  }
  return changes;
}

/** What to store for one change: an override row, or nothing (= delete) when it equals the season/base rules. */
export function overrideFor(change: BulkChange, rt: RateRoomType, seasons: RateSeason[]) {
  const ruled = nightlyPrices(rt, seasons, [], change.date, addDaysIso(change.date, 1))[0].price;
  const price = change.newPrice === ruled ? null : change.newPrice;
  if (price == null && change.newMinStay == null && !change.newClosed && !change.newCta) return null;
  return { price, minStay: change.newMinStay, closed: change.newClosed, closedToArrival: change.newCta };
}

export type GridCell = { date: string; price: number; source: "base" | "season" | "override"; weekend: boolean; seasonId: string | null; closed: boolean; cta: boolean; minStay: number; overridden: boolean };

/** Effective rates for the rate calendar. */
export function rateGrid(rt: RateRoomType, seasons: RateSeason[], overrides: RateOverride[], from: string, days: number): GridCell[] {
  const to = addDaysIso(from, days);
  const prices = nightlyPrices(rt, seasons, overrides, from, to);
  const ov = new Map(overrides.filter((o) => o.roomTypeId === rt.id).map((o) => [o.date, o]));
  return prices.map((p) => {
    const o = ov.get(p.date);
    const r = checkRestrictions(rt, seasons, overrides, p.date, addDaysIso(p.date, 1));
    return { date: p.date, price: p.price, source: p.source, weekend: p.weekend, seasonId: seasonFor(seasons, p.date)?.id ?? null, closed: !!o?.closed, cta: !!o?.closedToArrival, minStay: r.minStay, overridden: !!o };
  });
}

/** Pairs of seasons whose date ranges overlap (inclusive ends). */
export function seasonOverlaps(seasons: { id: string; name: string; startDate: string; endDate: string }[]) {
  const out: { a: string; b: string }[] = [];
  for (let i = 0; i < seasons.length; i++)
    for (let j = i + 1; j < seasons.length; j++)
      if (seasons[i].startDate <= seasons[j].endDate && seasons[j].startDate <= seasons[i].endDate) out.push({ a: seasons[i].id, b: seasons[j].id });
  return out;
}
