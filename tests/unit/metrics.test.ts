import { describe, expect, it } from "vitest";
import { periodStats } from "@/lib/admin/metrics";

describe("dashboard metrics", () => {
  const lines = [
    { checkIn: "2027-06-29", checkOut: "2027-07-02", nightlyPrices: [100, 110, 120], withRevenue: true }, // nights 29, 30 Jun, 1 Jul
    { checkIn: "2027-07-01", checkOut: "2027-07-02", nightlyPrices: [200], withRevenue: true },
    { checkIn: "2027-07-01", checkOut: "2027-07-03", nightlyPrices: [999, 999], withRevenue: false }, // Booking.com block: occupies, no revenue
  ];
  it("splits revenue by night across months", () => {
    expect(periodStats(lines, 10, "2027-06-01", "2027-07-01").revenue).toBe(210);
    expect(periodStats(lines, 10, "2027-07-01", "2027-08-01").revenue).toBe(320);
  });
  it("occupancy = occupied room-nights / available room-nights", () => {
    const s = periodStats(lines, 4, "2027-07-01", "2027-07-02");
    expect(s.occupied).toBe(3);
    expect(s.available).toBe(4);
    expect(s.occupancy).toBe(0.75);
    expect(s.revenue).toBe(320);
  });
});
