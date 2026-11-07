import { addDaysIso, nightsBetween } from "@/lib/booking/dates";

/** A booked room over a stay: one price per night (minor units). Dates are "YYYY-MM-DD", checkOut exclusive. */
/** `withRevenue: false` = the room is taken but the price isn't known here (e.g. a Booking.com / Airbnb iCal block). */
export type StayLine = { checkIn: string; checkOut: string; nightlyPrices: number[]; withRevenue: boolean };

/** Nights of [from, to) — inclusive start, exclusive end. */
export const nightsOf = (from: string, to: string) => Array.from({ length: Math.max(0, nightsBetween(from, to)) }, (_, i) => addDaysIso(from, i));

/**
 * Occupancy = occupied room-nights ÷ available room-nights. `rooms` is the number of sellable rooms.
 * Room revenue is counted per night (accrual), so a 3-night stay spanning two months is split correctly.
 */
export function periodStats(lines: StayLine[], rooms: number, from: string, to: string) {
  const nights = nightsOf(from, to);
  let occupied = 0, revenue = 0;
  for (const l of lines) {
    nightsOf(l.checkIn, l.checkOut).forEach((n, i) => {
      if (n >= from && n < to) { occupied++; if (l.withRevenue) revenue += l.nightlyPrices[i] ?? 0; }
    });
  }
  const available = rooms * nights.length;
  return { occupied, available, occupancy: available ? occupied / available : 0, revenue };
}
