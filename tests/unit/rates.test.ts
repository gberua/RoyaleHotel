import { describe, expect, it } from "vitest";
import { bulkPlan, overrideFor, rateGrid, seasonOverlaps, weekdayOf } from "@/lib/booking/rates";
import type { RateRoomType, RateSeason, RateOverride } from "@/lib/booking/engine";

const GEL = (n: number) => n * 100;
const rt: RateRoomType = { id: "a", slug: "a", basePrice: GEL(200), weekendPrice: GEL(240), minStay: 1, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, baseOccupancy: 2 };
const rt2: RateRoomType = { ...rt, id: "b", slug: "b", basePrice: GEL(100), weekendPrice: null };
const july: RateSeason = { id: "s", startDate: "2027-07-01", endDate: "2027-07-31", rates: [{ roomTypeId: "a", price: GEL(300), weekendPrice: GEL(350), minStay: null }] };
const ALL = [0, 1, 2, 3, 4, 5, 6];

describe("bulk price changes", () => {
  it("'all of July +15%' raises every night from its current price (season, weekend, override) and rounds to whole lari", () => {
    const ov: RateOverride[] = [{ roomTypeId: "a", date: "2027-07-10", price: GEL(333), minStay: null, closed: false, closedToArrival: false }];
    const plan = bulkPlan({ roomTypes: [rt], seasons: [july], overrides: ov, roomTypeIds: ["a"], from: "2027-07-01", to: "2027-07-31", weekdays: ALL, op: { kind: "percent", value: 15 } });
    expect(plan).toHaveLength(31);
    const byDate = Object.fromEntries(plan.map((c) => [c.date, c]));
    expect(byDate["2027-07-01"]).toMatchObject({ oldPrice: GEL(300), newPrice: GEL(345) }); // Thu, season
    expect(byDate["2027-07-02"]).toMatchObject({ oldPrice: GEL(350), newPrice: GEL(403) }); // Fri, season weekend (402.5 → 403)
    expect(byDate["2027-07-10"]).toMatchObject({ oldPrice: GEL(333), newPrice: GEL(383) }); // override (382.95 → 383)
  });
  it("respects weekday filters and the selected room types only", () => {
    const plan = bulkPlan({ roomTypes: [rt, rt2], seasons: [], overrides: [], roomTypeIds: ["b"], from: "2027-06-07", to: "2027-06-20", weekdays: [4, 5], op: { kind: "set", price: GEL(150) } });
    expect(plan.map((c) => c.date)).toEqual(["2027-06-11", "2027-06-12", "2027-06-18", "2027-06-19"]);
    expect(plan.every((c) => c.roomTypeId === "b" && c.oldPrice === GEL(100) && c.newPrice === GEL(150))).toBe(true);
    expect(plan.map((c) => weekdayOf(c.date))).toEqual([4, 5, 4, 5]);
  });
  it("supports amount, min stay, close / open and clear; unchanged dates are skipped", () => {
    expect(bulkPlan({ roomTypes: [rt2], seasons: [], overrides: [], roomTypeIds: ["b"], from: "2027-06-07", to: "2027-06-07", weekdays: ALL, op: { kind: "amount", value: -GEL(150) } })[0].newPrice).toBe(0);
    expect(bulkPlan({ roomTypes: [rt2], seasons: [], overrides: [], roomTypeIds: ["b"], from: "2027-06-07", to: "2027-06-08", weekdays: ALL, op: { kind: "minStay", value: 3 } }).map((c) => c.newMinStay)).toEqual([3, 3]);
    const closed: RateOverride[] = [{ roomTypeId: "b", date: "2027-06-07", price: null, minStay: null, closed: true, closedToArrival: false }];
    expect(bulkPlan({ roomTypes: [rt2], seasons: [], overrides: closed, roomTypeIds: ["b"], from: "2027-06-07", to: "2027-06-08", weekdays: ALL, op: { kind: "close" } })).toHaveLength(1);
    const cleared = bulkPlan({ roomTypes: [rt], seasons: [july], overrides: [{ roomTypeId: "a", date: "2027-07-05", price: GEL(999), minStay: 4, closed: true, closedToArrival: true }], roomTypeIds: ["a"], from: "2027-07-05", to: "2027-07-05", weekdays: ALL, op: { kind: "clear" } });
    expect(cleared[0]).toMatchObject({ newPrice: GEL(300), newMinStay: null, newClosed: false, newCta: false });
  });
  it("stores no override when the new value equals the season/base rule", () => {
    const [c] = bulkPlan({ roomTypes: [rt], seasons: [july], overrides: [{ roomTypeId: "a", date: "2027-07-05", price: GEL(999), minStay: null, closed: false, closedToArrival: false }], roomTypeIds: ["a"], from: "2027-07-05", to: "2027-07-05", weekdays: ALL, op: { kind: "set", price: GEL(300) } });
    expect(overrideFor(c, rt, [july])).toBeNull();
    const [d] = bulkPlan({ roomTypes: [rt], seasons: [july], overrides: [], roomTypeIds: ["a"], from: "2027-07-05", to: "2027-07-05", weekdays: ALL, op: { kind: "set", price: GEL(280) } });
    expect(overrideFor(d, rt, [july])).toEqual({ price: GEL(280), minStay: null, closed: false, closedToArrival: false });
  });
});

describe("rate grid & seasons", () => {
  it("shows the season, overrides and closed dates", () => {
    const grid = rateGrid(rt, [july], [{ roomTypeId: "a", date: "2027-07-01", price: null, minStay: 2, closed: true, closedToArrival: false }], "2027-06-30", 3);
    expect(grid.map((g) => [g.date, g.price, g.seasonId, g.closed, g.overridden, g.minStay])).toEqual([
      ["2027-06-30", GEL(200), null, false, false, 1],
      ["2027-07-01", GEL(300), "s", true, true, 2],
      ["2027-07-02", GEL(350), "s", false, false, 1],
    ]);
  });
  it("detects overlapping seasons (inclusive end dates)", () => {
    const s = [
      { id: "1", name: "June", startDate: "2027-06-01", endDate: "2027-06-30" },
      { id: "2", name: "Summer", startDate: "2027-06-30", endDate: "2027-08-31" },
      { id: "3", name: "Sept", startDate: "2027-09-01", endDate: "2027-09-30" },
    ];
    expect(seasonOverlaps(s)).toEqual([{ a: "1", b: "2" }]);
  });
});
