/**
 * Booking engine — PURE functions (no database, no clock). Everything that decides prices,
 * restrictions, occupancy, promos, taxes and refunds lives here so it can be unit-tested.
 *
 * Money is integer minor units (tetri). Dates are "YYYY-MM-DD" calendar dates; a stay's nights are
 * checkIn … checkOut-1 (the check-out day is never a night).
 *
 * Nightly price, per night:
 *   1. base price of the room type
 *   2. replaced by the seasonal rate if the night falls in a season (season start/end inclusive)
 *   3. weekend rule: Friday/Saturday nights use the weekend price of that level (if one is set)
 *   4. a date-specific override price, if set, is final for that date
 */
import { eachNight, isWeekendNight, nightsBetween } from "./dates";

export type RateRoomType = {
  id: string;
  slug: string;
  basePrice: number;
  weekendPrice: number | null;
  minStay: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  baseOccupancy: number;
};
export type RateSeason = {
  id: string;
  startDate: string; // inclusive
  endDate: string; // inclusive
  rates: { roomTypeId: string; price: number; weekendPrice: number | null; minStay: number | null }[];
};
export type RateOverride = { roomTypeId: string; date: string; price: number | null; minStay: number | null; closed: boolean; closedToArrival: boolean };
export type OccupancyRuleDef = { kind: string; minAge: number | null; maxAge: number | null; pricePerNight: number; percentOfRoom?: number | null };
export type ExtraUnit = "PER_STAY" | "PER_NIGHT" | "PER_GUEST" | "PER_GUEST_NIGHT";
export type ExtraDef = { id: string; key: string; price: number; unit: ExtraUnit; active: boolean };
export type PromoDef = {
  id: string; code: string; type: "PERCENT" | "FIXED"; value: number; active: boolean;
  validFrom: string | null; validTo: string | null; stayFrom: string | null; stayTo: string | null;
  minNights: number | null; maxUses: number | null; usedCount: number;
  /** empty = all room types */
  roomTypeIds?: string[];
};

export type NightPrice = { date: string; price: number; source: "base" | "season" | "override"; weekend: boolean };

// ───────────────────────────── Nightly prices ─────────────────────────────

export function seasonFor(seasons: RateSeason[], date: string) {
  return seasons.find((s) => s.startDate <= date && date <= s.endDate) ?? null;
}

export function nightlyPrices(rt: RateRoomType, seasons: RateSeason[], overrides: RateOverride[], checkIn: string, checkOut: string): NightPrice[] {
  const ov = new Map(overrides.filter((o) => o.roomTypeId === rt.id).map((o) => [o.date, o]));
  return eachNight(checkIn, checkOut).map((date) => {
    const weekend = isWeekendNight(date);
    const rate = seasonFor(seasons, date)?.rates.find((r) => r.roomTypeId === rt.id);
    let price = rate ? rate.price : rt.basePrice;
    let source: NightPrice["source"] = rate ? "season" : "base";
    if (weekend) price = rate ? (rate.weekendPrice ?? rate.price) : (rt.weekendPrice ?? rt.basePrice);
    const o = ov.get(date);
    if (o?.price != null) {
      price = o.price;
      source = "override";
    }
    return { date, price, source, weekend };
  });
}

// ───────────────────────────── Restrictions ─────────────────────────────

export type RestrictionResult = { ok: true; minStay: number } | { ok: false; reason: "closed" | "closed_to_arrival" | "min_stay"; minStay: number };

export function checkRestrictions(rt: RateRoomType, seasons: RateSeason[], overrides: RateOverride[], checkIn: string, checkOut: string): RestrictionResult {
  const ov = overrides.filter((o) => o.roomTypeId === rt.id);
  const nights = eachNight(checkIn, checkOut);
  const arrival = ov.find((o) => o.date === checkIn);
  const seasonMin = seasonFor(seasons, checkIn)?.rates.find((r) => r.roomTypeId === rt.id)?.minStay ?? null;
  const minStay = Math.max(rt.minStay, seasonMin ?? 1, arrival?.minStay ?? 1);
  if (nights.some((d) => ov.find((o) => o.date === d)?.closed)) return { ok: false, reason: "closed", minStay };
  if (arrival?.closedToArrival) return { ok: false, reason: "closed_to_arrival", minStay };
  if (nights.length < minStay) return { ok: false, reason: "min_stay", minStay };
  return { ok: true, minStay };
}

/** Same-day arrivals are allowed until the cutoff (local Tbilisi time "HH:MM"). */
export function arrivalAllowed(checkIn: string, todayLocal: string, timeLocal: string, cutoff: string) {
  if (checkIn > todayLocal) return true;
  if (checkIn < todayLocal) return false;
  return timeLocal < cutoff;
}

// ───────────────────────────── Occupancy & extra guests ─────────────────────────────

export function occupancyFits(rt: RateRoomType, adults: number, childAges: number[]) {
  const children = childAges.length;
  return adults >= 1 && adults <= rt.maxAdults && children <= rt.maxChildren + Math.max(0, rt.maxAdults - adults) && adults + children <= rt.maxOccupancy;
}

/** perNight = fixed amount; percent = share of that night's room price (percent wins when set). total is filled by buildQuote. */
export type ExtraGuestLine = { kind: "extra_adult" | "child"; age?: number; perNight: number; percent?: number | null; total?: number };

/**
 * Guests above the room's baseOccupancy pay the occupancy rules per night.
 * Adults take the included places first; remaining included places go to the OLDEST children
 * (young children are usually free anyway), so the guest always pays the minimum.
 */
export function extraGuestCharges(rt: RateRoomType, adults: number, childAges: number[], rules: OccupancyRuleDef[]): ExtraGuestLine[] {
  const lines: ExtraGuestLine[] = [];
  const included = rt.baseOccupancy;
  const extraAdults = Math.max(0, adults - included);
  const adultRule = rules.find((r) => r.kind === "extra_adult" || r.kind === "extra_bed");
  const adultLine = (): ExtraGuestLine => (adultRule?.percentOfRoom != null ? { kind: "extra_adult", perNight: 0, percent: adultRule.percentOfRoom } : { kind: "extra_adult", perNight: adultRule?.pricePerNight ?? 0 });
  for (let i = 0; i < extraAdults; i++) lines.push(adultLine());
  let freeSlots = Math.max(0, included - adults);
  for (const age of [...childAges].sort((a, b) => b - a)) {
    if (freeSlots > 0) { freeSlots--; continue; }
    const rule = rules.find((r) => r.kind === "child" && (r.minAge ?? 0) <= age && age <= (r.maxAge ?? 17));
    if (!rule) lines.push({ ...adultLine(), kind: "child", age });
    else lines.push(rule.percentOfRoom != null ? { kind: "child", age, perNight: 0, percent: rule.percentOfRoom } : { kind: "child", age, perNight: rule.pricePerNight });
  }
  return lines;
}

// ───────────────────────────── Extras ─────────────────────────────

export function extraTotal(extra: ExtraDef, quantity: number, nights: number, guests: number) {
  const q = Math.max(0, Math.floor(quantity));
  if (!q) return 0;
  switch (extra.unit) {
    case "PER_STAY": return extra.price * q;
    case "PER_NIGHT": return extra.price * q * nights;
    case "PER_GUEST": return extra.price * q * guests;
    case "PER_GUEST_NIGHT": return extra.price * q * guests * nights;
  }
}

// ───────────────────────────── Promo codes ─────────────────────────────

export type PromoResult = { ok: true; discount: number } | { ok: false; reason: "inactive" | "not_started" | "expired" | "stay_dates" | "min_nights" | "used_up" };

/** Discount applies to the accommodation subtotal (rooms + extra guests), never to extras or tax. */
export function evaluatePromo(p: PromoDef, bookingDate: string, checkIn: string, checkOut: string, roomSubtotal: number): PromoResult {
  if (!p.active) return { ok: false, reason: "inactive" };
  if (p.validFrom && bookingDate < p.validFrom) return { ok: false, reason: "not_started" };
  if (p.validTo && bookingDate > p.validTo) return { ok: false, reason: "expired" };
  const lastNight = eachNight(checkIn, checkOut).at(-1) ?? checkIn;
  if ((p.stayFrom && checkIn < p.stayFrom) || (p.stayTo && lastNight > p.stayTo)) return { ok: false, reason: "stay_dates" };
  if (p.minNights && nightsBetween(checkIn, checkOut) < p.minNights) return { ok: false, reason: "min_nights" };
  if (p.maxUses != null && p.usedCount >= p.maxUses) return { ok: false, reason: "used_up" };
  const discount = p.type === "PERCENT" ? Math.round((roomSubtotal * Math.min(100, p.value)) / 100) : Math.min(p.value, roomSubtotal);
  return { ok: true, discount };
}

// ───────────────────────────── Quote ─────────────────────────────

export type QuoteRoomInput = { roomType: RateRoomType; adults: number; childAges: number[] };
export type QuoteRoom = {
  roomTypeId: string; slug: string; adults: number; childAges: number[];
  nights: NightPrice[]; roomTotal: number; extraGuests: ExtraGuestLine[]; extraGuestTotal: number;
};
export type QuoteExtra = { extraId: string; key: string; quantity: number; unitPrice: number; unit: ExtraUnit; total: number };
export type Quote = {
  checkIn: string; checkOut: string; nightsCount: number;
  rooms: QuoteRoom[]; extras: QuoteExtra[];
  roomsTotal: number; extraGuestsTotal: number; extrasTotal: number;
  promo: { code: string; discount: number } | null; promoError: string | null;
  discountTotal: number; taxTotal: number; grandTotal: number; guests: number;
};

export function buildQuote(input: {
  checkIn: string; checkOut: string; rooms: QuoteRoomInput[];
  seasons: RateSeason[]; overrides: RateOverride[]; occupancyRules: OccupancyRuleDef[];
  extras: { extra: ExtraDef; quantity: number }[];
  promo: PromoDef | null; bookingDate: string;
  cityTaxPerPersonNight: number; cityTaxChildren: boolean;
}): Quote {
  const nightsCount = nightsBetween(input.checkIn, input.checkOut);
  const rooms: QuoteRoom[] = input.rooms.map((r) => {
    const nights = nightlyPrices(r.roomType, input.seasons, input.overrides, input.checkIn, input.checkOut);
    const extraGuests = extraGuestCharges(r.roomType, r.adults, r.childAges, input.occupancyRules).map((l) => ({
      ...l,
      total: nights.reduce((a, n) => a + (l.percent != null ? Math.round((n.price * l.percent) / 100) : l.perNight), 0),
    }));
    return {
      roomTypeId: r.roomType.id, slug: r.roomType.slug, adults: r.adults, childAges: r.childAges, nights,
      roomTotal: nights.reduce((a, n) => a + n.price, 0), extraGuests,
      extraGuestTotal: extraGuests.reduce((a, l) => a + (l.total ?? 0), 0),
    };
  });
  const guests = rooms.reduce((a, r) => a + r.adults + r.childAges.length, 0);
  const extras: QuoteExtra[] = input.extras
    .filter((e) => e.extra.active && e.quantity > 0)
    .map((e) => ({ extraId: e.extra.id, key: e.extra.key, quantity: e.quantity, unitPrice: e.extra.price, unit: e.extra.unit, total: extraTotal(e.extra, e.quantity, nightsCount, guests) }));
  const roomsTotal = rooms.reduce((a, r) => a + r.roomTotal, 0);
  const extraGuestsTotal = rooms.reduce((a, r) => a + r.extraGuestTotal, 0);
  const extrasTotal = extras.reduce((a, e) => a + e.total, 0);

  let promo: Quote["promo"] = null;
  let promoError: string | null = null;
  if (input.promo) {
    const only = input.promo.roomTypeIds ?? [];
    const eligible = only.length ? rooms.filter((r) => only.includes(r.roomTypeId)) : rooms;
    if (!eligible.length) promoError = "room_type";
    else {
      const res = evaluatePromo(input.promo, input.bookingDate, input.checkIn, input.checkOut, eligible.reduce((a, r) => a + r.roomTotal + r.extraGuestTotal, 0));
      if (res.ok) promo = { code: input.promo.code, discount: res.discount };
      else promoError = res.reason;
    }
  }
  const discountTotal = promo?.discount ?? 0;
  const taxedPeople = rooms.reduce((a, r) => a + r.adults + (input.cityTaxChildren ? r.childAges.length : 0), 0);
  const taxTotal = input.cityTaxPerPersonNight * taxedPeople * nightsCount;
  const grandTotal = roomsTotal + extraGuestsTotal + extrasTotal - discountTotal + taxTotal;
  return { checkIn: input.checkIn, checkOut: input.checkOut, nightsCount, rooms, extras, roomsTotal, extraGuestsTotal, extrasTotal, promo, promoError, discountTotal, taxTotal, grandTotal, guests };
}

/** Amount to charge online for the chosen plan. */
export function amountDue(plan: "pay_at_hotel" | "deposit" | "full", grandTotal: number, depositPercent: number) {
  if (plan === "pay_at_hotel") return 0;
  if (plan === "full") return grandTotal;
  return Math.max(1, Math.round((grandTotal * depositPercent) / 100));
}

// ───────────────────────────── Cancellation ─────────────────────────────

export type RefundResult = { freeCancellation: boolean; penalty: number; refund: number; deadline: string };

/**
 * Free cancellation until `freeDays` days before arrival (inclusive of that day).
 * After that the penalty applies: first night of each room, the full stay, or nothing.
 * Refund = amount already paid − penalty (never negative).
 */
export function cancellationTerms(args: {
  checkIn: string; todayLocal: string; freeDays: number; amountPaid: number; grandTotal: number;
  firstNights: number[]; penaltyRule: "first_night" | "percent" | "full_stay" | "none"; penaltyPercent?: number;
}): RefundResult {
  const deadline = new Date(Date.parse(`${args.checkIn}T00:00:00Z`) - args.freeDays * 86_400_000).toISOString().slice(0, 10);
  const freeCancellation = args.todayLocal <= deadline;
  const penalty = freeCancellation || args.penaltyRule === "none"
    ? 0
    : penaltyAmount(args.penaltyRule, { grandTotal: args.grandTotal, firstNights: args.firstNights, percent: args.penaltyPercent ?? 0 });
  return { freeCancellation, penalty, refund: Math.max(0, args.amountPaid - penalty), deadline };
}

/** Fee under a cancellation / no-show rule. */
export function penaltyAmount(rule: "first_night" | "percent" | "full_stay" | "none", b: { grandTotal: number; firstNights: number[]; percent: number }) {
  if (rule === "none") return 0;
  if (rule === "full_stay") return b.grandTotal;
  if (rule === "percent") return Math.round((b.grandTotal * Math.min(100, Math.max(0, b.percent))) / 100);
  return b.firstNights.reduce((a, x) => a + x, 0);
}
