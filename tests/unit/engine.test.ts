import { describe, expect, it } from "vitest";
import {
  amountDue, arrivalAllowed, buildQuote, cancellationTerms, checkRestrictions, evaluatePromo, extraGuestCharges, extraTotal,
  nightlyPrices, occupancyFits, type PromoDef, type RateRoomType, type RateSeason, type RateOverride,
} from "@/lib/booking/engine";
import { eachNight, nightsBetween } from "@/lib/booking/dates";

const GEL = (n: number) => n * 100;
const room: RateRoomType = { id: "rt1", slug: "deluxe", basePrice: GEL(200), weekendPrice: GEL(240), minStay: 1, maxAdults: 3, maxChildren: 2, maxOccupancy: 4, baseOccupancy: 2 };
const summer: RateSeason = { id: "s", startDate: "2027-07-01", endDate: "2027-08-31", rates: [{ roomTypeId: "rt1", price: GEL(320), weekendPrice: GEL(360), minStay: 3 }] };
const rules = [
  { kind: "child", minAge: 0, maxAge: 5, pricePerNight: 0 },
  { kind: "child", minAge: 6, maxAge: 12, pricePerNight: GEL(40) },
  { kind: "extra_adult", minAge: 13, maxAge: null, pricePerNight: GEL(60) },
];
const promo = (p: Partial<PromoDef> = {}): PromoDef => ({ id: "p", code: "TEST", type: "PERCENT", value: 10, active: true, validFrom: null, validTo: null, stayFrom: null, stayTo: null, minNights: null, maxUses: null, usedCount: 0, ...p });

describe("nights & dates", () => {
  it("never counts the check-out day as a night", () => {
    expect(eachNight("2027-06-10", "2027-06-13")).toEqual(["2027-06-10", "2027-06-11", "2027-06-12"]);
    expect(nightsBetween("2027-06-10", "2027-06-13")).toBe(3);
  });
  it("handles month and year boundaries", () => {
    expect(eachNight("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});

describe("nightly prices: base → season → weekend → override", () => {
  it("uses base and base-weekend prices outside seasons (Fri/Sat are weekend nights)", () => {
    // 2027-06-03 Thu, 06-04 Fri, 06-05 Sat, 06-06 Sun
    const n = nightlyPrices(room, [summer], [], "2027-06-03", "2027-06-07");
    expect(n.map((x) => x.price)).toEqual([GEL(200), GEL(240), GEL(240), GEL(200)]);
    expect(n.map((x) => x.weekend)).toEqual([false, true, true, false]);
  });
  it("switches to the season exactly on its first night and back after its last night", () => {
    // 2027-06-29 Tue, 06-30 Wed (base) | 07-01 Thu (season) … 08-31 Tue (season) | 09-01 Wed (base)
    expect(nightlyPrices(room, [summer], [], "2027-06-29", "2027-07-02").map((x) => [x.date, x.price, x.source])).toEqual([
      ["2027-06-29", GEL(200), "base"], ["2027-06-30", GEL(200), "base"], ["2027-07-01", GEL(320), "season"],
    ]);
    expect(nightlyPrices(room, [summer], [], "2027-08-31", "2027-09-02").map((x) => [x.price, x.source])).toEqual([[GEL(320), "season"], [GEL(200), "base"]]);
  });
  it("applies the season's weekend price on Fri/Sat", () => {
    const n = nightlyPrices(room, [summer], [], "2027-07-02", "2027-07-04"); // Fri, Sat
    expect(n.map((x) => x.price)).toEqual([GEL(360), GEL(360)]);
  });
  it("lets a date override win over season and weekend", () => {
    const ov: RateOverride[] = [{ roomTypeId: "rt1", date: "2027-07-03", price: GEL(500), minStay: null, closed: false, closedToArrival: false }];
    const n = nightlyPrices(room, [summer], ov, "2027-07-02", "2027-07-04");
    expect(n.map((x) => [x.price, x.source])).toEqual([[GEL(360), "season"], [GEL(500), "override"]]);
  });
  it("ignores overrides of other room types", () => {
    const ov: RateOverride[] = [{ roomTypeId: "other", date: "2027-06-03", price: 1, minStay: null, closed: true, closedToArrival: false }];
    expect(nightlyPrices(room, [], ov, "2027-06-03", "2027-06-04")[0].price).toBe(GEL(200));
    expect(checkRestrictions(room, [], ov, "2027-06-03", "2027-06-04").ok).toBe(true);
  });
});

describe("restrictions", () => {
  it("enforces the season minimum stay based on the arrival date", () => {
    expect(checkRestrictions(room, [summer], [], "2027-07-10", "2027-07-12")).toEqual({ ok: false, reason: "min_stay", minStay: 3 });
    expect(checkRestrictions(room, [summer], [], "2027-07-10", "2027-07-13")).toEqual({ ok: true, minStay: 3 });
    // arriving the day before the season → season min-stay does not apply
    expect(checkRestrictions(room, [summer], [], "2027-06-30", "2027-07-02").ok).toBe(true);
  });
  it("blocks a stay containing a closed night, but not one where the closed date is the check-out day", () => {
    const ov: RateOverride[] = [{ roomTypeId: "rt1", date: "2027-06-12", price: null, minStay: null, closed: true, closedToArrival: false }];
    expect(checkRestrictions(room, [], ov, "2027-06-10", "2027-06-13")).toMatchObject({ ok: false, reason: "closed" });
    expect(checkRestrictions(room, [], ov, "2027-06-10", "2027-06-12").ok).toBe(true);
  });
  it("supports closed-to-arrival and per-date min stay", () => {
    const ov: RateOverride[] = [
      { roomTypeId: "rt1", date: "2027-06-10", price: null, minStay: null, closed: false, closedToArrival: true },
      { roomTypeId: "rt1", date: "2027-06-20", price: null, minStay: 4, closed: false, closedToArrival: false },
    ];
    expect(checkRestrictions(room, [], ov, "2027-06-10", "2027-06-12")).toMatchObject({ ok: false, reason: "closed_to_arrival" });
    expect(checkRestrictions(room, [], ov, "2027-06-09", "2027-06-12").ok).toBe(true);
    expect(checkRestrictions(room, [], ov, "2027-06-20", "2027-06-23")).toMatchObject({ ok: false, reason: "min_stay", minStay: 4 });
  });
  it("allows same-day arrival only before the cutoff (Tbilisi time)", () => {
    expect(arrivalAllowed("2027-06-10", "2027-06-10", "19:59", "20:00")).toBe(true);
    expect(arrivalAllowed("2027-06-10", "2027-06-10", "20:00", "20:00")).toBe(false);
    expect(arrivalAllowed("2027-06-09", "2027-06-10", "08:00", "20:00")).toBe(false);
    expect(arrivalAllowed("2027-06-11", "2027-06-10", "23:59", "20:00")).toBe(true);
  });
});

describe("occupancy & extra guests", () => {
  it("checks max adults / children / total", () => {
    expect(occupancyFits(room, 2, [4, 8])).toBe(true);
    expect(occupancyFits(room, 3, [4])).toBe(true);
    expect(occupancyFits(room, 4, [])).toBe(false);
    expect(occupancyFits(room, 2, [1, 2, 3])).toBe(false);
    expect(occupancyFits(room, 0, [5])).toBe(false);
  });
  it("charges adults above the included occupancy and children by age, oldest children use free places first", () => {
    expect(extraGuestCharges(room, 2, [], rules)).toEqual([]);
    expect(extraGuestCharges(room, 3, [], rules)).toEqual([{ kind: "extra_adult", perNight: GEL(60) }]);
    // 1 adult + children 8 and 3: the 8-year-old takes the free place, the 3-year-old is free by age
    expect(extraGuestCharges(room, 1, [3, 8], rules).reduce((a, l) => a + l.perNight, 0)).toBe(0);
    // 2 adults + children 8 and 3: both children are extra → 40 + 0
    expect(extraGuestCharges(room, 2, [3, 8], rules).map((l) => l.perNight).sort()).toEqual([0, GEL(40)]);
  });
});

describe("extras", () => {
  const breakfast = { id: "b", key: "breakfast", price: GEL(30), unit: "PER_GUEST_NIGHT" as const, active: true };
  it("prices every unit type", () => {
    expect(extraTotal(breakfast, 1, 3, 2)).toBe(GEL(180));
    expect(extraTotal({ ...breakfast, unit: "PER_STAY" }, 2, 3, 2)).toBe(GEL(60));
    expect(extraTotal({ ...breakfast, unit: "PER_NIGHT" }, 1, 3, 2)).toBe(GEL(90));
    expect(extraTotal({ ...breakfast, unit: "PER_GUEST" }, 1, 3, 2)).toBe(GEL(60));
    expect(extraTotal(breakfast, 0, 3, 2)).toBe(0);
  });
});

describe("promo codes", () => {
  it("applies percent and fixed discounts to the room subtotal only", () => {
    expect(evaluatePromo(promo(), "2027-01-01", "2027-06-10", "2027-06-13", GEL(600))).toEqual({ ok: true, discount: GEL(60) });
    expect(evaluatePromo(promo({ type: "FIXED", value: GEL(1000) }), "2027-01-01", "2027-06-10", "2027-06-13", GEL(600))).toEqual({ ok: true, discount: GEL(600) });
  });
  it("respects booking window, stay window, min nights and usage limits", () => {
    expect(evaluatePromo(promo({ validTo: "2026-12-31" }), "2027-01-01", "2027-06-10", "2027-06-13", 1)).toEqual({ ok: false, reason: "expired" });
    expect(evaluatePromo(promo({ validFrom: "2027-02-01" }), "2027-01-01", "2027-06-10", "2027-06-13", 1)).toEqual({ ok: false, reason: "not_started" });
    // stay window is about nights: a stay whose last night is 09-30 fits stayTo 09-30 even though check-out is 10-01
    expect(evaluatePromo(promo({ stayFrom: "2027-06-01", stayTo: "2027-09-30" }), "2027-01-01", "2027-09-28", "2027-10-01", 1).ok).toBe(true);
    expect(evaluatePromo(promo({ stayFrom: "2027-06-01", stayTo: "2027-09-30" }), "2027-01-01", "2027-09-29", "2027-10-02", 1)).toEqual({ ok: false, reason: "stay_dates" });
    expect(evaluatePromo(promo({ minNights: 3 }), "2027-01-01", "2027-06-10", "2027-06-12", 1)).toEqual({ ok: false, reason: "min_nights" });
    expect(evaluatePromo(promo({ maxUses: 5, usedCount: 5 }), "2027-01-01", "2027-06-10", "2027-06-13", 1)).toEqual({ ok: false, reason: "used_up" });
    expect(evaluatePromo(promo({ maxUses: 5, usedCount: 4 }), "2027-01-01", "2027-06-10", "2027-06-13", GEL(100)).ok).toBe(true);
    expect(evaluatePromo(promo({ active: false }), "2027-01-01", "2027-06-10", "2027-06-13", 1)).toEqual({ ok: false, reason: "inactive" });
  });
});

describe("full quote", () => {
  it("adds rooms + extra guests + extras − discount + city tax, for multiple rooms", () => {
    const q = buildQuote({
      checkIn: "2027-06-30", checkOut: "2027-07-03", // Wed base, Thu season, Fri season-weekend
      rooms: [{ roomType: room, adults: 3, childAges: [] }, { roomType: room, adults: 2, childAges: [8] }],
      seasons: [summer], overrides: [], occupancyRules: rules,
      extras: [{ extra: { id: "b", key: "breakfast", price: GEL(30), unit: "PER_GUEST_NIGHT", active: true }, quantity: 1 }],
      promo: promo({ value: 10 }), bookingDate: "2027-01-01", cityTaxPerPersonNight: GEL(2), cityTaxChildren: false,
    });
    const perRoom = GEL(200) + GEL(320) + GEL(360);
    expect(q.roomsTotal).toBe(perRoom * 2);
    expect(q.extraGuestsTotal).toBe(GEL(60) * 3 + GEL(40) * 3);
    expect(q.extrasTotal).toBe(GEL(30) * 6 * 3);
    expect(q.discountTotal).toBe(Math.round((q.roomsTotal + q.extraGuestsTotal) * 0.1));
    expect(q.taxTotal).toBe(GEL(2) * 5 * 3);
    expect(q.grandTotal).toBe(q.roomsTotal + q.extraGuestsTotal + q.extrasTotal - q.discountTotal + q.taxTotal);
    expect(q.guests).toBe(6);
  });
  it("reports an invalid promo instead of applying it", () => {
    const q = buildQuote({ checkIn: "2027-06-10", checkOut: "2027-06-11", rooms: [{ roomType: room, adults: 2, childAges: [] }], seasons: [], overrides: [], occupancyRules: rules, extras: [], promo: promo({ maxUses: 1, usedCount: 1 }), bookingDate: "2027-01-01", cityTaxPerPersonNight: 0, cityTaxChildren: false });
    expect(q.promo).toBeNull();
    expect(q.promoError).toBe("used_up");
    expect(q.grandTotal).toBe(GEL(200));
  });
  it("computes amount due per payment plan", () => {
    expect(amountDue("pay_at_hotel", GEL(1000), 30)).toBe(0);
    expect(amountDue("deposit", GEL(1000), 30)).toBe(GEL(300));
    expect(amountDue("full", GEL(1000), 30)).toBe(GEL(1000));
  });
});

describe("cancellation", () => {
  const base = { checkIn: "2027-07-10", freeDays: 7, amountPaid: GEL(900), grandTotal: GEL(900), firstNights: [GEL(300)], penaltyRule: "first_night" as const };
  it("is free up to and including the deadline day", () => {
    expect(cancellationTerms({ ...base, todayLocal: "2027-07-03" })).toEqual({ freeCancellation: true, penalty: 0, refund: GEL(900), deadline: "2027-07-03" });
  });
  it("charges the first night after the deadline", () => {
    expect(cancellationTerms({ ...base, todayLocal: "2027-07-04" })).toMatchObject({ freeCancellation: false, penalty: GEL(300), refund: GEL(600) });
  });
  it("never refunds more than was paid", () => {
    expect(cancellationTerms({ ...base, amountPaid: GEL(100), todayLocal: "2027-07-08" })).toMatchObject({ penalty: GEL(300), refund: 0 });
    expect(cancellationTerms({ ...base, amountPaid: 0, todayLocal: "2027-07-01" }).refund).toBe(0);
  });
});
