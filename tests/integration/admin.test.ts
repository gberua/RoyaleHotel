/**
 * Admin panel integration tests (real PostgreSQL, separate test database).
 * Server actions are called directly with a mocked signed-in user, so the SERVER-side role checks are exercised.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string; adminLocale: string } }));
vi.mock("@/lib/admin-auth", () => ({
  currentStaff: async () => session.user,
  requirePermission: async () => session.user,
}));
vi.mock("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, revalidateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  draftMode: async () => ({ isEnabled: false, enable: () => {}, disable: () => {} }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` }); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn(), connection: async () => {} }));
vi.mock("@/auth", () => ({ signIn: async () => {}, signOut: async () => {}, auth: async () => null }));
vi.mock("@/lib/notify/email", () => ({ sendMail: vi.fn(async () => ({ ok: true })) }));

import { db } from "@/lib/db";
import { addDaysIso, todayInGeorgia, toDate } from "@/lib/booking/dates";
import { finalizeBooking, holdRooms, quoteCart } from "@/lib/booking/service";
import { applyRates, previewRates } from "@/app/admin/rates/actions";
import { deleteRoom, deleteRoomType, setRoomTypeActive } from "@/app/admin/rooms/actions";
import { saveStaff, setStaffActive } from "@/app/admin/staff/actions";
import { saveSettings } from "@/app/admin/settings/actions";
import { savePromo, saveSeason } from "@/app/admin/pricing-actions";
import { publishPage, savePageDraft } from "@/app/admin/content/actions";
import { verifyLogin, LOCK_AFTER } from "@/lib/admin/login";
import { createResetToken, findResetToken, hashPassword } from "@/lib/admin/passwords";
import { resetPassword } from "@/app/admin/account/actions";

const start = addDaysIso(todayInGeorgia(), 30);
let typeId = "";
let roomId = "";
const users: Record<string, { id: string; name: string; email: string; role: string; adminLocale: string }> = {};
const as = (role: keyof typeof users) => { session.user = users[role]; };
const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

async function reset() {
  await db.$executeRawUnsafe(`TRUNCATE "RoomAllocation","BookingExtra","Payment","BookingNote","Booking","Guest","Room","RoomTypePhoto","RoomTypeAmenity","SeasonRate","Season","RateOverride","RoomType","OccupancyRule","Extra","PromoCode","Setting","BookingSequence","IcalFeed","ActivityLog","PasswordResetToken","User","Page" CASCADE`);
  await db.setting.create({ data: { key: "booking", value: { holdMinutes: 15, sameDayCutoff: "23:59" } } });
  const rt = await db.roomType.create({ data: { slug: "double", name: { en: "Double" }, basePrice: 20000, maxAdults: 2, maxOccupancy: 2 } });
  const room = await db.room.create({ data: { number: "101", roomTypeId: rt.id } });
  typeId = rt.id; roomId = room.id;
  const hash = await hashPassword("Correct-horse-42");
  for (const role of ["OWNER", "MANAGER", "RECEPTION", "HOUSEKEEPING"]) {
    const u = await db.user.create({ data: { email: `${role.toLowerCase()}@test.local`, name: role, role: role as never, passwordHash: hash, adminLocale: "en" } });
    users[role] = { id: u.id, name: u.name, email: u.email, role, adminLocale: "en" };
  }
}

beforeEach(reset);
afterAll(() => db.$disconnect());

describe("server-side role checks", () => {
  it("receptionist can't change prices, rooms, staff or settings", async () => {
    as("RECEPTION");
    expect(await applyRates({ ok: true }, form({ roomTypeId: typeId, from: start, to: start, op: "set", value: "300", weekday: ["0", "1", "2", "3", "4", "5", "6"] }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await deleteRoom({ ok: true }, form({ id: roomId }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await saveStaff({ ok: true }, form({ name: "X Y", email: "x@test.local", role: "OWNER", adminLocale: "en" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await saveSettings({ ok: true }, form({ section: "booking", depositPercent: "0" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await db.rateOverride.count()).toBe(0);
  });
  it("housekeeping can't touch bookings content or prices", async () => {
    as("HOUSEKEEPING");
    expect(await savePageDraft({ ok: true }, form({ key: "home" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await savePromo({ ok: true }, form({ code: "HACK50", type: "PERCENT", value: "50" }))).toMatchObject({ ok: false, error: "forbidden" });
  });
  it("manager can change prices but not staff or settings", async () => {
    as("MANAGER");
    expect(await saveStaff({ ok: true }, form({ name: "New Person", email: "new@test.local", role: "RECEPTION", adminLocale: "ka" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await saveSettings({ ok: true }, form({ section: "booking", depositPercent: "10" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect((await savePromo({ ok: true }, form({ code: "SUMMER10", type: "PERCENT", value: "10", active: "on" }))).ok).toBe(true);
  });
  it("signed-out requests are refused", async () => {
    session.user = null;
    expect(await applyRates({ ok: true }, form({}))).toMatchObject({ ok: false, error: "session_expired" });
  });
});

describe("bulk price changes", () => {
  it("preview shows old → new, apply changes only the selected weekdays, and existing bookings keep their price", async () => {
    as("MANAGER");
    // an existing booking on the first night, made at the old price
    const hold = await holdRooms({ checkIn: start, checkOut: addDaysIso(start, 1), lines: [{ roomTypeId: typeId, adults: 2, childAges: [] }], locale: "en" });
    const before = await finalizeBooking({ holdId: hold.holdId, guest: { firstName: "A", lastName: "B", email: "a@b.test", phone: "+995555111111" }, extras: [], plan: "pay_at_hotel" });
    expect(before.booking.grandTotal).toBe(20000);

    const weekdays = ["5", "6"]; // Sat, Sun (Mon = 0)
    const body = { roomTypeId: typeId, from: start, to: addDaysIso(start, 13), op: "percent", value: "10", weekday: weekdays };
    const p = await previewRates({ ok: true }, form(body));
    expect(p.ok).toBe(true);
    const data = (p as { data: { count: number; rows: { oldPrice: number; newPrice: number; date: string }[] } }).data;
    expect(data.count).toBe(4); // two weekends in 14 days
    expect(data.rows.every((r) => r.oldPrice === 20000 && r.newPrice === 22000)).toBe(true);
    expect(await db.rateOverride.count()).toBe(0); // preview never writes

    const a = await applyRates({ ok: true }, form(body));
    expect(a.ok).toBe(true);
    const overrides = await db.rateOverride.findMany();
    expect(overrides).toHaveLength(4);
    expect(overrides.every((o) => o.price === 22000 && [0, 6].includes(o.date.getUTCDay()))).toBe(true);
    const log = await db.activityLog.findFirst({ where: { action: "rates.bulk" } });
    expect(log?.userId).toBe(users.MANAGER.id);

    // existing booking unchanged; a new quote over a weekend uses the new price
    expect((await db.booking.findUniqueOrThrow({ where: { id: before.booking.id } })).grandTotal).toBe(20000);
    const sat = overrides[0].date.toISOString().slice(0, 10);
    const { quote } = await quoteCart({ checkIn: sat, checkOut: addDaysIso(sat, 1), lines: [{ roomTypeId: typeId, adults: 2, childAges: [] }], extras: [] });
    expect(quote.grandTotal).toBe(22000);
  });
  it("setting a price equal to the normal one removes the override instead of storing a copy", async () => {
    as("OWNER");
    await applyRates({ ok: true }, form({ roomTypeId: typeId, from: start, to: start, op: "set", value: "250", weekday: ["0", "1", "2", "3", "4", "5", "6"] }));
    expect(await db.rateOverride.count()).toBe(1);
    await applyRates({ ok: true }, form({ roomTypeId: typeId, from: start, to: start, op: "set", value: "200", weekday: ["0", "1", "2", "3", "4", "5", "6"] }));
    expect(await db.rateOverride.count()).toBe(0);
  });
  it("seasons that overlap are saved but flagged", async () => {
    as("OWNER");
    const s1 = await saveSeason({ ok: true }, form({ "name.en": "Summer", startDate: start, endDate: addDaysIso(start, 30), color: "#14b8c4", [`price.${typeId}`]: "300" }));
    expect(s1).toMatchObject({ ok: true });
    const s2 = await saveSeason({ ok: true }, form({ "name.en": "Peak", startDate: addDaysIso(start, 10), endDate: addDaysIso(start, 20), color: "#ff0000", [`price.${typeId}`]: "400" }));
    expect(s2).toMatchObject({ ok: true, message: "saved_with_overlap" });
  });
});

describe("room deletion protection", () => {
  it("a room type / room with a future booking can't be deleted, only archived", async () => {
    as("MANAGER");
    const hold = await holdRooms({ checkIn: start, checkOut: addDaysIso(start, 2), lines: [{ roomTypeId: typeId, adults: 2, childAges: [] }], locale: "en" });
    const b = await finalizeBooking({ holdId: hold.holdId, guest: { firstName: "A", lastName: "B", email: "a@b.test", phone: "+995555111111" }, extras: [], plan: "pay_at_hotel" });
    const r1 = await deleteRoomType({ ok: true }, form({ id: typeId }));
    expect(r1).toMatchObject({ ok: false, error: "has_future_bookings" });
    expect((r1 as { values?: Record<string, string> }).values?.codes).toContain(b.booking.code);
    expect(await deleteRoom({ ok: true }, form({ id: roomId }))).toMatchObject({ ok: false, error: "has_future_bookings" });
    expect(await db.roomType.count()).toBe(1);
    expect((await setRoomTypeActive({ ok: true }, form({ id: typeId, active: "false" }))).ok).toBe(true);
    expect((await db.roomType.findUniqueOrThrow({ where: { id: typeId } })).active).toBe(false);
  });
  it("an unused room can be deleted", async () => {
    as("MANAGER");
    expect((await deleteRoom({ ok: true }, form({ id: roomId }))).ok).toBe(true);
    expect(await db.room.count()).toBe(0);
  });
});

describe("staff accounts", () => {
  it("owner creates staff with a one-time password; the last owner can't be removed", async () => {
    as("OWNER");
    const r = await saveStaff({ ok: true }, form({ name: "Nino Receptionist", email: "Nino@Test.local", role: "RECEPTION", adminLocale: "ka" }));
    expect(r.ok && (r as { data?: { password?: string } }).data?.password).toBeTruthy();
    const nino = await db.user.findUniqueOrThrow({ where: { email: "nino@test.local" } });
    const pw = (r as { data: { password: string } }).data.password;
    expect((await verifyLogin("nino@test.local", pw, null)).ok).toBe(true);
    expect(await setStaffActive({ ok: true }, form({ id: users.OWNER.id, active: "false" }))).toMatchObject({ ok: false, error: "self_deactivate" });
    expect(await saveStaff({ ok: true }, form({ id: users.OWNER.id, name: "OWNER", email: users.OWNER.email, role: "MANAGER", adminLocale: "en" }))).toMatchObject({ ok: false, error: "self_role" });
    // deactivation ends sessions: passwordChangedAt moves forward
    const t0 = nino.passwordChangedAt.getTime();
    await setStaffActive({ ok: true }, form({ id: nino.id, active: "false" }));
    const after = await db.user.findUniqueOrThrow({ where: { id: nino.id } });
    expect(after.active).toBe(false);
    expect(after.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(t0);
    expect((await verifyLogin("nino@test.local", pw, null)).ok).toBe(false);
  });
  it("five wrong passwords lock the account; every failure is logged with the IP", async () => {
    for (let i = 0; i < LOCK_AFTER; i++) expect((await verifyLogin("reception@test.local", "wrong-password-1", "198.51.100.7")).ok).toBe(false);
    const locked = await verifyLogin("reception@test.local", "Correct-horse-42", "198.51.100.7");
    expect(locked).toEqual({ ok: false, reason: "locked" });
    const logs = await db.activityLog.findMany({ where: { action: "auth.login_failed" } });
    expect(logs.length).toBe(LOCK_AFTER + 1);
    expect(logs.every((l) => l.ip === "198.51.100.7")).toBe(true);
  });
  it("password reset link works once", async () => {
    const token = await createResetToken(users.RECEPTION.id);
    expect(await findResetToken(token)).not.toBeNull();
    expect(await resetPassword({ ok: true }, form({ token, password: "short", confirm: "short" }))).toMatchObject({ ok: false, error: "password_weak" });
    expect(await resetPassword({ ok: true }, form({ token, password: "Brand-new-pass-7", confirm: "Brand-new-pass-7" }))).toMatchObject({ ok: true });
    expect((await verifyLogin("reception@test.local", "Brand-new-pass-7", null)).ok).toBe(true);
    expect(await resetPassword({ ok: true }, form({ token, password: "Another-pass-8", confirm: "Another-pass-8" }))).toMatchObject({ ok: false, error: "token_invalid" });
  });
});

describe("settings & content", () => {
  it("settings changes are validated and logged with old → new", async () => {
    as("OWNER");
    expect(await saveSettings({ ok: true }, form({ section: "booking", depositPercent: "150" }))).toMatchObject({ ok: false, fieldErrors: { depositPercent: "too_big" } });
    const fields = { section: "booking", depositPercent: "40", freeCancellationDays: "5", lateCancellationPenalty: "percent", lateCancellationPercent: "50", noShowPenalty: "first_night", noShowPercent: "100", sameDayCutoff: "21:00", holdMinutes: "20", maxAdvanceDays: "400", maxRoomsPerBooking: "4", cityTaxPerPersonNight: "0" };
    expect((await saveSettings({ ok: true }, form(fields))).ok).toBe(true);
    const row = await db.setting.findUniqueOrThrow({ where: { key: "booking" } });
    expect((row.value as { depositPercent: number }).depositPercent).toBe(40);
    const log = await db.activityLog.findFirstOrThrow({ where: { action: "settings.booking" } });
    expect(log.after).toMatchObject({ depositPercent: 40, lateCancellationPenalty: "percent" });
  });
  it("page edits stay in a draft until published", async () => {
    as("MANAGER");
    await db.page.create({ data: { key: "rooms", sections: { title: { en: "Rooms" } } } });
    await savePageDraft({ ok: true }, form({ key: "rooms", "title.en": "Our rooms", "intro.en": "Calm rooms by the sea" }));
    let page = await db.page.findUniqueOrThrow({ where: { key: "rooms" } });
    expect((page.sections as { title: { en: string } }).title.en).toBe("Rooms");
    expect(page.draft).not.toBeNull();
    expect((await publishPage({ ok: true }, form({ key: "rooms" }))).ok).toBe(true);
    page = await db.page.findUniqueOrThrow({ where: { key: "rooms" } });
    expect((page.sections as { title: { en: string } }).title.en).toBe("Our rooms");
    expect(page.draft).toBeNull();
  });
});

// keep TS happy about unused helpers in some runs
void toDate;
