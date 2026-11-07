/**
 * Admin phase 2 (daily operations) against the real PostgreSQL test database:
 * calendar drag-and-drop moves, automatic e-mails, housekeeping permissions, check-in warning.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string; adminLocale: string } }));
const mail = vi.hoisted(() => ({ sent: [] as { to: string | string[]; subject: string; html: string }[] }));
vi.mock("@/lib/admin-auth", () => ({ currentStaff: async () => session.user, requirePermission: async () => session.user }));
vi.mock("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, revalidateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {} }), draftMode: async () => ({ isEnabled: false }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` }); } }));
vi.mock("next/server", () => ({ after: () => {}, connection: async () => {} }));
vi.mock("@/auth", () => ({ signIn: async () => {}, signOut: async () => {}, auth: async () => null }));
vi.mock("@/lib/notify/email", () => ({ sendMail: vi.fn(async (m: { to: string | string[]; subject: string; html: string }) => { mail.sent.push(m); return { ok: true }; }) }));
vi.mock("@/lib/notify/telegram", () => ({ sendTelegram: async () => ({ ok: true }) }));

import { db } from "@/lib/db";
import { addDaysIso, todayInGeorgia } from "@/lib/booking/dates";
import { BookingError, finalizeBooking, holdRooms, moveBooking } from "@/lib/booking/service";
import { sendAutomaticEmails } from "@/lib/notify/automatic";
import { applyMove, previewMove, adminChangeStatus } from "@/app/admin/booking-actions";
import { setHousekeeping } from "@/app/admin/housekeeping/actions";

const today = todayInGeorgia();
const day = (n: number) => addDaysIso(today, n);
let doubleId = "", suiteId = "";
const rooms: Record<string, string> = {};
const users: Record<string, { id: string; name: string; email: string; role: string; adminLocale: string }> = {};
const as = (role: string) => { session.user = users[role]; };
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

async function book(roomTypeId: string, checkIn: string, nights: number, guest = "a@b.test", lines = 1) {
  const h = await holdRooms({ checkIn, checkOut: addDaysIso(checkIn, nights), lines: Array.from({ length: lines }, () => ({ roomTypeId, adults: 2, childAges: [] })), locale: "en", staff: true });
  const r = await finalizeBooking({ holdId: h.holdId, guest: { firstName: "Ana", lastName: "Test", email: guest, phone: "+995555123456" }, extras: [], plan: "pay_at_hotel" });
  return db.booking.findUniqueOrThrow({ where: { id: r.booking.id }, include: { rooms: true } });
}

beforeEach(async () => {
  mail.sent.length = 0;
  await db.$executeRawUnsafe(`TRUNCATE "RoomAllocation","BookingExtra","Payment","BookingNote","Booking","Guest","Room","RoomTypePhoto","RoomTypeAmenity","SeasonRate","Season","RateOverride","RoomType","OccupancyRule","Extra","PromoCode","Setting","BookingSequence","IcalFeed","ActivityLog","User","EmailTemplate" CASCADE`);
  await db.setting.create({ data: { key: "booking", value: { holdMinutes: 15, sameDayCutoff: "23:59" } } });
  const double = await db.roomType.create({ data: { slug: "double", name: { en: "Double" }, basePrice: 20000, maxAdults: 2, maxOccupancy: 2 } });
  const suite = await db.roomType.create({ data: { slug: "suite", name: { en: "Suite" }, basePrice: 40000, maxAdults: 2, maxOccupancy: 2 } });
  doubleId = double.id; suiteId = suite.id;
  for (const [n, t] of [["101", double.id], ["102", double.id], ["201", suite.id]] as const) rooms[n] = (await db.room.create({ data: { number: n, roomTypeId: t, floor: Number(n[0]) } })).id;
  for (const role of ["OWNER", "MANAGER", "RECEPTION", "HOUSEKEEPING"]) {
    const u = await db.user.create({ data: { email: `${role.toLowerCase()}@test.local`, name: role, role: role as never, passwordHash: "x", adminLocale: "en" } });
    users[role] = { id: u.id, name: u.name, email: u.email, role, adminLocale: "en" };
  }
});
afterAll(() => db.$disconnect());

describe("calendar drag-and-drop", () => {
  it("moves a booking to a free room; refuses a room that is taken", async () => {
    const a = await book(doubleId, day(10), 3);
    const b = await book(doubleId, day(11), 2);
    const aAlloc = a.rooms[0], bRoom = b.rooms[0].roomId;
    await expect(moveBooking({ allocationId: aAlloc.id, roomId: bRoom, checkIn: day(10) })).rejects.toMatchObject({ code: "room_busy" });
    const free = Object.values(rooms).find((id) => id !== aAlloc.roomId && id !== bRoom)!;
    const plan = await moveBooking({ allocationId: aAlloc.id, roomId: free, checkIn: day(10) });
    expect(plan.repriced).toBe(false);
    expect(plan.newTotal).toBe(plan.oldTotal); // a room change alone keeps the price
    expect((await db.roomAllocation.findUniqueOrThrow({ where: { id: aAlloc.id } })).roomId).toBe(free);
  });

  it("preview (dry run) changes nothing; moving dates re-prices and checks every room of the booking", async () => {
    await db.rateOverride.create({ data: { roomTypeId: doubleId, date: new Date(`${day(31)}T00:00:00Z`), price: 30000 } });
    const a = await book(doubleId, day(20), 2, "x@y.test", 2); // two rooms
    as("MANAGER");
    const p = await previewMove({ ok: true }, form({ allocationId: a.rooms[0].id, roomId: a.rooms[0].roomId, checkIn: day(30) }));
    expect(p.ok && p.data).toMatchObject({ repriced: true, oldTotal: 80000, newTotal: 100000 }); // night of day 31 costs 300 for both rooms
    expect((await db.booking.findUniqueOrThrow({ where: { id: a.id } })).grandTotal).toBe(80000);
    // block one of the booking's rooms on the new dates → the whole move is refused
    await book(doubleId, day(30), 1, "other@y.test");
    const r = await applyMove({ ok: true }, form({ allocationId: a.rooms[0].id, roomId: a.rooms[0].roomId, checkIn: day(30) }));
    expect(r).toMatchObject({ ok: false, error: "booking_room_busy" });
    const ok = await applyMove({ ok: true }, form({ allocationId: a.rooms[0].id, roomId: a.rooms[0].roomId, checkIn: day(40) }));
    expect(ok.ok).toBe(true);
    const after = await db.booking.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.checkIn.toISOString().slice(0, 10)).toBe(day(40));
    const log = await db.activityLog.findFirstOrThrow({ where: { action: "booking.calendar_move" } });
    expect(log.userId).toBe(users.MANAGER.id);
    expect(log.after).toMatchObject({ checkIn: day(40) });
  });

  it("two staff dragging different bookings into the same free room at the same moment → only one wins", async () => {
    const a = await book(doubleId, day(50), 2);
    const b = await book(doubleId, day(50), 2);
    const target = rooms["201"];
    const results = await Promise.allSettled([a, b].map((x) => moveBooking({ allocationId: x.rooms[0].id, roomId: target, checkIn: day(50) })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(BookingError) });
    expect(await db.roomAllocation.count({ where: { roomId: target, active: true } })).toBe(1);
  });

  it("checked-in guests can change room but not dates; nothing moves into the past", async () => {
    const a = await book(doubleId, day(0), 2);
    await db.booking.update({ where: { id: a.id }, data: { status: "CHECKED_IN" } });
    await expect(moveBooking({ allocationId: a.rooms[0].id, roomId: a.rooms[0].roomId, checkIn: day(1) })).rejects.toMatchObject({ code: "checked_in_dates" });
    const b = await book(doubleId, day(5), 2);
    await expect(moveBooking({ allocationId: b.rooms[0].id, roomId: b.rooms[0].roomId, checkIn: day(-3) })).rejects.toMatchObject({ code: "past" });
  });
});

describe("automatic e-mails", () => {
  async function aged(b: { id: string }, hoursAgo: number) {
    await db.booking.update({ where: { id: b.id }, data: { createdAt: new Date(Date.now() - hoursAgo * 3600_000) } });
  }
  it("pre-arrival reminder goes out once, in the guest's language, only to real e-mail addresses", async () => {
    const due = await book(doubleId, day(2), 2, "due@guest.test");
    await aged(due, 72);
    const fresh = await book(doubleId, day(3), 2, "fresh@guest.test"); // booked just now → no reminder
    const walkIn = await book(suiteId, day(2), 2, "no-email+1@guests.royalehotel.local");
    await aged(walkIn, 72);
    const far = await book(doubleId, day(10), 2, "far@guest.test");
    await aged(far, 72);
    await db.booking.update({ where: { id: due.id }, data: { locale: "ru" } });

    const r1 = await sendAutomaticEmails(today);
    expect(r1.reminders).toBe(1);
    expect(mail.sent.map((m) => m.to)).toEqual(["due@guest.test"]);
    expect(mail.sent[0].subject).toContain("До скорой встречи");
    expect((await db.booking.findUniqueOrThrow({ where: { id: due.id } })).reminderSentAt).not.toBeNull();
    expect((await sendAutomaticEmails(today)).reminders).toBe(0); // never twice
    void fresh;
  });

  it("review request after check-out uses the owner's edited template; switched off → nothing is sent", async () => {
    const stay = await book(doubleId, day(5), 2, "stay@guest.test");
    await db.booking.update({ where: { id: stay.id }, data: { status: "CHECKED_OUT", checkIn: new Date(`${day(-3)}T00:00:00Z`), checkOut: new Date(`${day(-1)}T00:00:00Z`) } });
    await db.emailTemplate.create({ data: { key: "post_stay", locale: "en", subject: "How was it, {{guestName}}?", body: "Review here: {{reviewLink}}" } });
    await db.setting.create({ data: { key: "automation", value: { postStayEnabled: false } } });
    expect((await sendAutomaticEmails(today)).reviews).toBe(0);
    await db.setting.update({ where: { key: "automation" }, data: { value: { postStayEnabled: true, postStayDays: 1 } } });
    const r = await sendAutomaticEmails(today);
    expect(r.reviews).toBe(1);
    expect(mail.sent[0].subject).toBe("How was it, Ana?");
    expect(mail.sent[0].html).toContain(`/reviews?code=${stay.code}`);
  });
});

describe("housekeeping & check-in", () => {
  it("housekeeping marks rooms clean but not inspected; reception can only look", async () => {
    await db.room.update({ where: { id: rooms["101"] }, data: { housekeeping: "DIRTY" } });
    as("HOUSEKEEPING");
    expect((await setHousekeeping({ ok: true }, form({ roomId: rooms["101"], status: "CLEAN" }))).ok).toBe(true);
    expect(await setHousekeeping({ ok: true }, form({ roomId: rooms["101"], status: "INSPECTED" }))).toMatchObject({ ok: false, error: "forbidden" });
    const r = await db.room.findUniqueOrThrow({ where: { id: rooms["101"] } });
    expect(r).toMatchObject({ housekeeping: "CLEAN", housekeepingBy: "HOUSEKEEPING" });
    as("RECEPTION");
    expect(await setHousekeeping({ ok: true }, form({ roomId: rooms["101"], status: "DIRTY" }))).toMatchObject({ ok: false, error: "forbidden" });
    as("MANAGER");
    expect((await setHousekeeping({ ok: true }, form({ roomId: rooms["101"], status: "INSPECTED" }))).ok).toBe(true);
  });

  it("checking a guest into a room that isn't clean needs an explicit 'check in anyway'", async () => {
    const b = await book(doubleId, day(0), 2);
    await db.room.update({ where: { id: b.rooms[0].roomId }, data: { housekeeping: "DIRTY" } });
    as("RECEPTION");
    const warn = await adminChangeStatus({ ok: true }, form({ code: b.code, to: "CHECKED_IN" }));
    expect(warn).toMatchObject({ ok: false, error: "room_not_clean" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CONFIRMED");
    expect((await adminChangeStatus({ ok: true }, form({ code: b.code, to: "CHECKED_IN", force: "1" }))).ok).toBe(true);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CHECKED_IN");
  });
});


