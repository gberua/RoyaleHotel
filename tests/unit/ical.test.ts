import { describe, expect, it } from "vitest";
import { buildIcal, nightsToRanges, parseIcal } from "@/lib/ical/parse";

const BOOKING_COM = `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Booking.com//EN\r
BEGIN:VEVENT\r
UID:1234@booking.com\r
DTSTART;VALUE=DATE:20270710\r
DTEND;VALUE=DATE:20270714\r
SUMMARY:CLOSED - Not available\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled@booking.com\r
DTSTART;VALUE=DATE:20270801\r
DTEND;VALUE=DATE:20270803\r
STATUS:CANCELLED\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:airbnb-folded-uid-that-is-very-long-and-continues\r
 -on-the-next-line@airbnb.com\r
DTSTART:20270901T140000Z\r
SUMMARY:Reserved\r
END:VEVENT\r
END:VCALENDAR\r
`;

describe("iCal parser", () => {
  it("reads Booking.com all-day events, skips cancelled ones, unfolds long lines and defaults DTEND", () => {
    expect(parseIcal(BOOKING_COM)).toEqual([
      { uid: "1234@booking.com", start: "2027-07-10", end: "2027-07-14", summary: "CLOSED - Not available" },
      { uid: "airbnb-folded-uid-that-is-very-long-and-continues-on-the-next-line@airbnb.com", start: "2027-09-01", end: "2027-09-02", summary: "Reserved" },
    ]);
  });
  it("collapses blocked nights into ranges with exclusive end dates", () => {
    expect(nightsToRanges(["2027-07-03", "2027-07-01", "2027-07-02", "2027-07-05"])).toEqual([
      { start: "2027-07-01", end: "2027-07-04" }, { start: "2027-07-05", end: "2027-07-06" },
    ]);
  });
  it("builds a feed that parses back to the same events", () => {
    const ev = [{ uid: "a@royale", start: "2027-07-01", end: "2027-07-04", summary: "Not available, sorry" }];
    const ics = buildIcal("Test", ev);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270701");
    expect(ics.split("\r\n").length).toBeGreaterThan(5);
    expect(parseIcal(ics)).toEqual(ev);
  });
});
