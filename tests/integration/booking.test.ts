/**
 * Integration tests against the real PostgreSQL engine (separate database: royale_hotel_test).
 * They prove the no-double-booking guarantees under true concurrency.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  BookingError, cancelBooking, cancellationPreview, confirmPaidBooking, finalizeBooking, holdRooms, releaseExpired, searchAvailability,
} from "@/lib/booking/service";
import { addDaysIso, todayInGeorgia, toDate } from "@/lib/booking/dates";

const checkIn = addDaysIso(todayInGeorgia(), 40);
const checkOut = addDaysIso(checkIn, 3);
const guest = (n: number) => ({ firstName: "Test", lastName: `Guest${n}`, email: `guest${n}@example.test`, phone: "+995555000000" });
let singleTypeId = "";
let pairTypeId = "";

async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE "RoomAllocation","BookingExtra","Payment","BookingNote","Booking","Guest","Room","RoomTypePhoto","RoomTypeAmenity","SeasonRate","Season","RateOverride","RoomType","OccupancyRule","Extra","PromoCode","Setting","BookingSequence","IcalFeed" CASCADE`);
  await db.setting.create({ data: { key: "booking", value: { holdMinutes: 15, depositPercent: 30, freeCancellationDays: 7, sameDayCutoff: "23:59" } } });
  const single = await db.roomType.create({ data: { slug: "single", name: { en: "Single" }, basePrice: 10000, maxAdults: 2, maxOccupancy: 2 } });
  await db.room.create({ data: { number: "S1", roomTypeId: single.id } });
  const pair = await db.roomType.create({ data: { slug: "pair", name: { en: "Pair" }, basePrice: 20000, maxAdults: 2, maxOccupancy: 3, maxChildren: 1 } });
  await db.room.createMany({ data: [{ number: "P1", roomTypeId: pair.id }, { number: "P2", roomTypeId: pair.id }] });
  singleTypeId = single.id;
  pairTypeId = pair.id;
}

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const line = (roomTypeId: string) => [{ roomTypeId, adults: 2, childAges: [] as number[] }];

describe("no double bookings", () => {
  it("25 simultaneous holds for the single last room → exactly one succeeds", async () => {
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(24);
    expect(failed.every((f) => f.reason instanceof BookingError && f.reason.code === "sold_out")).toBe(true);
    const active = await db.roomAllocation.count({ where: { active: true } });
    expect(active).toBe(1);
  });

  it("15 simultaneous full checkouts (hold → confirm) for the last free room → exactly one confirmed booking", async () => {
    // one of the two rooms is already booked
    const first = await holdRooms({ checkIn, checkOut, lines: line(pairTypeId), locale: "en" });
    await finalizeBooking({ holdId: first.holdId, guest: guest(0), extras: [], plan: "pay_at_hotel" });

    const attempt = async (i: number) => {
      const h = await holdRooms({ checkIn, checkOut, lines: line(pairTypeId), locale: "en" });
      return finalizeBooking({ holdId: h.holdId, guest: guest(i), extras: [], plan: "pay_at_hotel" });
    };
    const results = await Promise.allSettled(Array.from({ length: 15 }, (_, i) => attempt(i + 1)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const confirmed = await db.booking.count({ where: { status: "CONFIRMED" } });
    expect(confirmed).toBe(2);
    // and the database confirms no room is used twice on any night
    const overlaps = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "RoomAllocation" a JOIN "RoomAllocation" b
      ON a."roomId" = b."roomId" AND a.id < b.id AND a.active AND b.active
      AND daterange(a."checkIn", a."checkOut") && daterange(b."checkIn", b."checkOut")`;
    expect(Number(overlaps[0].n)).toBe(0);
  });

  it("the database itself rejects overlapping allocations even if application checks are bypassed", async () => {
    const room = await db.room.findFirstOrThrow({ where: { number: "S1" } });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      db.roomAllocation.create({ data: { roomId: room.id, checkIn: toDate(addDaysIso(checkIn, i % 2)), checkOut: toDate(addDaysIso(checkOut, i % 2)), kind: "BOOKING" } })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("allows back-to-back stays: check-out day = next guest's check-in day", async () => {
    await holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" });
    await expect(holdRooms({ checkIn: checkOut, checkOut: addDaysIso(checkOut, 2), lines: line(singleTypeId), locale: "en" })).resolves.toBeTruthy();
    await expect(holdRooms({ checkIn: addDaysIso(checkIn, 1), checkOut: addDaysIso(checkIn, 2), lines: line(singleTypeId), locale: "en" })).rejects.toMatchObject({ code: "sold_out" });
  });

  it("multi-room booking takes two different rooms, and a third room of that type is sold out", async () => {
    const h = await holdRooms({ checkIn, checkOut, lines: [...line(pairTypeId), ...line(pairTypeId)], locale: "en" });
    const rooms = await db.roomAllocation.findMany({ where: { bookingId: h.holdId } });
    expect(new Set(rooms.map((r) => r.roomId)).size).toBe(2);
    await expect(holdRooms({ checkIn, checkOut, lines: line(pairTypeId), locale: "en" })).rejects.toMatchObject({ code: "sold_out" });
  });
});

describe("holds & lifecycle", () => {
  it("expired holds release the room automatically", async () => {
    const h = await holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" });
    expect((await searchAvailability({ checkIn, checkOut, adults: 2, childAges: [] })).find((t) => t.slug === "single")?.status).toBe("sold_out");
    await db.booking.update({ where: { id: h.holdId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await db.roomAllocation.updateMany({ where: { bookingId: h.holdId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const released = await releaseExpired();
    expect(released.bookings).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: h.holdId } })).status).toBe("EXPIRED");
    expect((await searchAvailability({ checkIn, checkOut, adults: 2, childAges: [] })).find((t) => t.slug === "single")?.status).toBe("available");
    // the expired checkout can no longer be completed
    await expect(finalizeBooking({ holdId: h.holdId, guest: guest(1), extras: [], plan: "pay_at_hotel" })).rejects.toMatchObject({ code: "hold_expired" });
  });

  it("assigns sequential booking codes RH-YYYY-0001, RH-YYYY-0002", async () => {
    const year = new Date().getFullYear();
    const a = await holdRooms({ checkIn, checkOut, lines: line(pairTypeId), locale: "en" });
    const b = await holdRooms({ checkIn, checkOut, lines: line(pairTypeId), locale: "en" });
    const ra = await finalizeBooking({ holdId: a.holdId, guest: guest(1), extras: [], plan: "pay_at_hotel" });
    const rb = await finalizeBooking({ holdId: b.holdId, guest: guest(2), extras: [], plan: "pay_at_hotel" });
    expect(ra.booking.code).toBe(`RH-${year}-0001`);
    expect(rb.booking.code).toBe(`RH-${year}-0002`);
  });

  it("prepayment: stays pending until the provider confirms; duplicate callbacks are ignored", async () => {
    const h = await holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" });
    const f = await finalizeBooking({ holdId: h.holdId, guest: guest(1), extras: [], plan: "deposit" });
    expect(f.confirmed).toBe(false);
    expect(f.booking.status).toBe("PENDING");
    expect(f.amountDue).toBe(Math.round(f.quote.grandTotal * 0.3));
    const pay = { provider: "mock", providerRef: "mock-1", amount: f.amountDue };
    const c1 = await confirmPaidBooking(h.holdId, pay);
    const c2 = await confirmPaidBooking(h.holdId, pay);
    expect(c1.booking.status).toBe("CONFIRMED");
    expect(c1.booking.paymentStatus).toBe("DEPOSIT_PAID");
    expect(c2.alreadyProcessed).toBe(true);
    expect(await db.payment.count({ where: { bookingId: h.holdId, status: "succeeded" } })).toBe(1);
  });

  it("cancellation refunds in full inside the free-cancellation window and frees the room", async () => {
    const h = await holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" });
    const f = await finalizeBooking({ holdId: h.holdId, guest: guest(1), extras: [], plan: "full" });
    await confirmPaidBooking(h.holdId, { provider: "mock", providerRef: "m-2", amount: f.amountDue });
    const preview = await cancellationPreview(h.holdId);
    expect(preview).toMatchObject({ freeCancellation: true, penalty: 0, refund: f.amountDue });
    const { booking } = await cancelBooking(h.holdId, "Guest cancelled");
    expect(booking.status).toBe("CANCELLED");
    expect(booking.refundAmount).toBe(f.amountDue);
    await expect(holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" })).resolves.toBeTruthy();
  });

  it("a promo code with one remaining use cannot be used twice, even concurrently", async () => {
    await db.promoCode.create({ data: { code: "ONCE", type: "PERCENT", value: 10, maxUses: 1 } });
    const a = await holdRooms({ checkIn, checkOut, lines: line(pairTypeId), locale: "en" });
    const b = await holdRooms({ checkIn, checkOut, lines: line(pairTypeId), locale: "en" });
    const results = await Promise.allSettled([a, b].map((h, i) => finalizeBooking({ holdId: h.holdId, guest: guest(i), extras: [], plan: "pay_at_hotel", promoCode: "ONCE" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.promoCode.findUniqueOrThrow({ where: { code: "ONCE" } })).usedCount).toBe(1);
  });

  it("out-of-order rooms are not sold", async () => {
    await db.room.updateMany({ where: { number: "S1" }, data: { housekeeping: "OUT_OF_ORDER" } });
    await expect(holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" })).rejects.toMatchObject({ code: "sold_out" });
  });
});

describe("audit regressions", () => {
  it("a late payment callback never puts a cancelled booking back into its room", async () => {
    const h = await holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" });
    await finalizeBooking({ holdId: h.holdId, guest: guest(1), extras: [], plan: "pay_at_hotel" });
    await cancelBooking(h.holdId, "Guest cancelled");
    const { booking } = await confirmPaidBooking(h.holdId, { provider: "mock", providerRef: "late-1", amount: 5000 });
    expect(booking.status).toBe("CANCELLED");
    expect(await db.roomAllocation.count({ where: { bookingId: h.holdId, active: true } })).toBe(0);
    // the room is still free for the next guest
    await expect(holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" })).resolves.toBeTruthy();
  });

  it("a two-room booking of different types keeps each room's own nightly prices", async () => {
    const lines = [...line(singleTypeId), ...line(pairTypeId)];
    const h = await holdRooms({ checkIn, checkOut, lines, locale: "en" });
    // make "oldest first" disagree with the order the rooms were added
    const [first, second] = await db.roomAllocation.findMany({ where: { bookingId: h.holdId }, orderBy: { createdAt: "asc" } });
    await db.roomAllocation.update({ where: { id: first.id }, data: { createdAt: new Date(second.createdAt.getTime() + 5_000) } });
    await finalizeBooking({ holdId: h.holdId, guest: guest(1), extras: [], plan: "pay_at_hotel" });
    const allocs = await db.roomAllocation.findMany({ where: { bookingId: h.holdId } });
    expect(allocs.find((a) => a.roomTypeId === singleTypeId)!.nightlyPrices).toEqual([10000, 10000, 10000]);
    expect(allocs.find((a) => a.roomTypeId === pairTypeId)!.nightlyPrices).toEqual([20000, 20000, 20000]);
  });

  it("a promo use is counted once per booking and given back when the booking expires unpaid", async () => {
    await db.promoCode.create({ data: { code: "TWICE", type: "PERCENT", value: 10, maxUses: 2 } });
    const used = async () => (await db.promoCode.findUniqueOrThrow({ where: { code: "TWICE" } })).usedCount;
    const h = await holdRooms({ checkIn, checkOut, lines: line(singleTypeId), locale: "en" });
    // the guest submits the payment step twice (e.g. went back after a failed card)
    await finalizeBooking({ holdId: h.holdId, guest: guest(1), extras: [], plan: "full", promoCode: "TWICE" });
    await finalizeBooking({ holdId: h.holdId, guest: guest(1), extras: [], plan: "full", promoCode: "TWICE" });
    expect(await used()).toBe(1);
    // never pays → the booking expires and the use is returned
    await db.booking.update({ where: { id: h.holdId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await releaseExpired();
    await releaseExpired();
    expect(await used()).toBe(0);
    // paid after all (slow bank) → the booking is revived and counts again
    await confirmPaidBooking(h.holdId, { provider: "mock", providerRef: "slow-1", amount: 1000 });
    expect(await used()).toBe(1);
  });
});
