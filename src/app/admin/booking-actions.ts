"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ActionError, staffAction, type ActionResult } from "@/lib/admin-action";
import { currentStaff, requirePermission } from "@/lib/admin-auth";
import { can, type RoleName } from "@/lib/permissions";
import { clientIp } from "@/lib/rate-limit";
import { isIsoDate } from "@/lib/booking/dates";
import {
  BookingError, cancelBooking, cancellationPreview, changeDates, changeStatus, finalizeBooking, holdRooms, logActivity, moveAllocation, moveBooking, quoteCart, recordManualPayment, type MovePlan,
} from "@/lib/booking/service";
import { notifyBookingCancelled, notifyBookingConfirmed } from "@/lib/notify/booking-mail";
import { refundBookingPayments } from "@/lib/payments";
import { syncIcalFeed } from "@/lib/ical/sync";

type Result = ActionResult;
/** error → translation key (admin.errors.*) */
const errKey = (e: unknown) => (e instanceof BookingError ? `booking_${e.code}` : e instanceof z.ZodError ? "invalid_form" : (console.error(e), "unexpected"));
const gel = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "0").replace(",", ".")) * 100);

async function bookingByCode(code: string) {
  const b = await db.booking.findUnique({ where: { code } });
  if (!b) throw new BookingError("not_found");
  return b;
}
const done = (code: string) => revalidatePath(`/admin/bookings/${code}`);

export async function adminChangeStatus(_p: Result, form: FormData): Promise<Result> {
  return staffAction("bookings", async (user) => {
    const b = await bookingByCode(String(form.get("code")));
    const to = z.enum(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW"]).parse(form.get("to"));
    if (to === "CHECKED_IN" && form.get("force") !== "1") {
      // warn before checking a guest into a room that isn't clean (staff can still confirm "check in anyway")
      const rooms = await db.roomAllocation.findMany({ where: { bookingId: b.id, active: true }, include: { room: { select: { number: true, housekeeping: true } } } });
      const notReady = rooms.filter((r) => r.room.housekeeping !== "CLEAN" && r.room.housekeeping !== "INSPECTED");
      if (notReady.length) return { ok: false, error: "room_not_clean", values: { rooms: notReady.map((r) => r.room.number).join(", ") } };
    }
    const updated = await changeStatus(b.id, to);
    await logActivity({ userId: user.id, action: `booking.status.${to.toLowerCase()}`, entity: "Booking", entityId: b.id, summary: `${b.code}: ${b.status} → ${to}`, ip: await clientIp() });
    if (to === "CONFIRMED" && b.status === "PENDING") after(() => notifyBookingConfirmed(b.id));
    done(updated.code);
    if (updated.code !== b.code) redirect(`/admin/bookings/${updated.code}`);
    return { ok: true, message: "status_changed" };
  });
}

export async function adminRecordPayment(_p: Result, form: FormData): Promise<Result> {
  return staffAction("bookings", async (user) => {
    const b = await bookingByCode(String(form.get("code")));
    const amount = gel(form.get("amount"));
    const method = z.enum(["cash", "card_terminal", "bank_transfer"]).parse(form.get("method"));
    if (!amount || amount < 0 || amount > 10_000_000) throw new ActionError("price_invalid");
    await recordManualPayment(b.id, amount, method);
    await logActivity({ userId: user.id, action: "payment.record", entity: "Booking", entityId: b.id, summary: `${b.code}: payment ${amount / 100} GEL (${method})`, ip: await clientIp() });
    done(b.code);
    return { ok: true, message: "payment_recorded" };
  });
}

export async function adminMoveRoom(_p: Result, form: FormData): Promise<Result> {
  return staffAction("bookings", async (user) => {
    const b = await bookingByCode(String(form.get("code")));
    const allocationId = String(form.get("allocationId"));
    const before = await db.roomAllocation.findUniqueOrThrow({ where: { id: allocationId }, include: { room: true } });
    if (before.bookingId !== b.id) throw new BookingError("not_found");
    const after_ = await moveAllocation(allocationId, String(form.get("roomId")));
    const room = await db.room.findUnique({ where: { id: after_.roomId } });
    await logActivity({ userId: user.id, action: "booking.move_room", entity: "Booking", entityId: b.id, summary: `${b.code}: room ${before.room.number} → ${room?.number}`, before: { room: before.room.number }, after: { room: room?.number }, ip: await clientIp() });
    done(b.code);
    return { ok: true, message: "room_moved", values: { room: room?.number ?? "" } };
  });
}

export async function adminChangeDates(_p: Result, form: FormData): Promise<Result> {
  return staffAction("bookings", async (user) => {
    const b = await bookingByCode(String(form.get("code")));
    const checkIn = String(form.get("checkIn")), checkOut = String(form.get("checkOut"));
    const updated = await changeDates(b.id, checkIn, checkOut);
    await logActivity({ userId: user.id, action: "booking.change_dates", entity: "Booking", entityId: b.id, summary: `${b.code}: ${b.checkIn.toISOString().slice(0, 10)}→${b.checkOut.toISOString().slice(0, 10)} changed to ${checkIn}→${checkOut}; total ${b.grandTotal / 100} → ${updated.grandTotal / 100} GEL`, before: { checkIn: b.checkIn, checkOut: b.checkOut, total: b.grandTotal }, after: { checkIn, checkOut, total: updated.grandTotal }, ip: await clientIp() });
    done(b.code);
    return { ok: true, message: "dates_changed", values: { total: (updated.grandTotal / 100).toFixed(2) } };
  });
}

export async function adminCancel(_p: Result, form: FormData): Promise<Result> {
  return staffAction("bookings", async (user) => {
    const b = await bookingByCode(String(form.get("code")));
    const preview = await cancellationPreview(b.id);
    const refund = form.get("refundMode") === "custom" ? gel(form.get("refundAmount")) : form.get("refundMode") === "none" ? 0 : preview.refund;
    await cancelBooking(b.id, String(form.get("reason") || "Cancelled by hotel").slice(0, 300));
    await db.booking.update({ where: { id: b.id }, data: { refundAmount: refund } });
    const r = form.get("refundOnline") === "on" ? await refundBookingPayments(b.id, refund) : { refunded: 0 };
    await logActivity({ userId: user.id, action: "booking.cancel", entity: "Booking", entityId: b.id, summary: `${b.code} cancelled by staff; refund ${refund / 100} GEL (online ${r.refunded / 100})`, ip: await clientIp() });
    if (form.get("notifyGuest") === "on") after(() => notifyBookingCancelled(b.id, "staff"));
    done(b.code);
    return { ok: true, message: "booking_cancelled" };
  });
}

export async function adminAddNote(_p: Result, form: FormData): Promise<Result> {
  return staffAction("bookings", async (user) => {
    const b = await bookingByCode(String(form.get("code")));
    const body = String(form.get("body") ?? "").trim().slice(0, 2000);
    if (!body) throw new ActionError("required");
    await db.bookingNote.create({ data: { bookingId: b.id, userId: user.id, body } });
    await logActivity({ userId: user.id, action: "booking.note", entity: "Booking", entityId: b.id, summary: `${b.code}: note added` });
    done(b.code);
    return { ok: true, message: "note_added" };
  });
}

// ───────────────────────────── Manual bookings ─────────────────────────────

const manualSchema = z.object({
  checkIn: z.string().refine(isIsoDate), checkOut: z.string().refine(isIsoDate),
  lines: z.array(z.object({ roomTypeId: z.string().min(1), adults: z.number().int().min(1).max(6), childAges: z.array(z.number().int().min(0).max(17)).max(6) })).min(1).max(6),
  extras: z.array(z.object({ extraId: z.string(), quantity: z.number().int().min(0).max(10) })).max(20),
  promoCode: z.string().max(40).optional(),
  guest: z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().trim().max(200).optional(), phone: z.string().trim().min(5).max(30), country: z.string().max(60).optional() }),
  source: z.enum(["PHONE", "WALK_IN", "WHATSAPP", "OTHER"]),
  note: z.string().max(2000).optional(),
  sendEmail: z.boolean().optional(),
});
export type ManualInput = z.infer<typeof manualSchema>;

export async function previewManualBooking(input: Omit<ManualInput, "guest" | "source">) {
  const user = await currentStaff();
  if (!user || !can(user.role as RoleName, "bookings")) return { ok: false as const, message: "forbidden" };
  try {
    const p = manualSchema.pick({ checkIn: true, checkOut: true, lines: true, extras: true, promoCode: true }).parse(input);
    const { quote } = await quoteCart({ checkIn: p.checkIn, checkOut: p.checkOut, lines: p.lines, extras: p.extras, promoCode: p.promoCode });
    return { ok: true as const, quote };
  } catch (e) {
    return { ok: false as const, message: e instanceof z.ZodError ? "manual_dates" : errKey(e) };
  }
}

/** Phone / walk-in / WhatsApp bookings use exactly the same availability + pricing engine as the website. */
export async function createManualBooking(input: ManualInput) {
  const user = await currentStaff();
  if (!user || !can(user.role as RoleName, "bookings")) return { ok: false as const, message: "forbidden" };
  let code = "";
  try {
    const p = manualSchema.parse(input);
    const email = p.guest.email && /^\S+@\S+\.\S+$/.test(p.guest.email) ? p.guest.email : `no-email+${Date.now()}@guests.royalehotel.local`;
    const hold = await holdRooms({ checkIn: p.checkIn, checkOut: p.checkOut, lines: p.lines, locale: "ka", staff: true });
    const res = await finalizeBooking({ holdId: hold.holdId, guest: { ...p.guest, email }, extras: p.extras, promoCode: p.promoCode || null, plan: "pay_at_hotel", source: p.source, staffConfirm: true });
    code = res.booking.code;
    if (p.note?.trim()) await db.bookingNote.create({ data: { bookingId: res.booking.id, userId: user.id, body: p.note.trim() } });
    await logActivity({ userId: user.id, action: "booking.create_manual", entity: "Booking", entityId: res.booking.id, summary: `${code} created by staff (${p.source})`, ip: await clientIp() });
    if (p.sendEmail && !email.endsWith("@guests.royalehotel.local")) after(() => notifyBookingConfirmed(res.booking.id));
  } catch (e) {
    return { ok: false as const, message: e instanceof z.ZodError ? "manual_required" : errKey(e) };
  }
  redirect(`/admin/bookings/${code}`);
}

// ───────────────────────────── Channels (iCal) ─────────────────────────────

export async function adminAddFeed(_p: Result, form: FormData): Promise<Result> {
  return staffAction("channels", async (user) => {
    const p = z.object({ roomTypeId: z.string().min(1), channel: z.enum(["booking_com", "airbnb", "expedia", "other"]), importUrl: z.url().max(1000).optional().or(z.literal("")) }).parse(Object.fromEntries(form));
    const feed = await db.icalFeed.create({ data: { roomTypeId: p.roomTypeId, channel: p.channel, importUrl: p.importUrl || null, name: p.channel } });
    await logActivity({ userId: user.id, action: "ical.add", entity: "IcalFeed", entityId: feed.id, summary: `${p.channel} feed added` });
    if (feed.importUrl) await syncIcalFeed(feed.id);
    revalidatePath("/admin/channels");
    return { ok: true, message: "channel_added" };
  });
}

export async function adminSyncFeed(form: FormData) {
  const user = await requirePermission("channels");
  const id = String(form.get("id"));
  const r = await syncIcalFeed(id);
  await logActivity({ userId: user.id, action: "ical.sync", entity: "IcalFeed", entityId: id, summary: `Manual sync: ${r.imported} imported, ${r.conflicts.length} conflicts` });
  revalidatePath("/admin/channels");
}

export async function adminRemoveFeed(form: FormData) {
  const user = await requirePermission("channels");
  const id = String(form.get("id"));
  await db.roomAllocation.updateMany({ where: { icalFeedId: id }, data: { active: false } });
  await db.icalFeed.update({ where: { id }, data: { active: false } });
  await logActivity({ userId: user.id, action: "ical.remove", entity: "IcalFeed", entityId: id, summary: "Channel feed removed (its blocks released)" });
  revalidatePath("/admin/channels");
}

// ───────────────────────────── Calendar drag & drop ─────────────────────────────

const moveSchema = z.object({ allocationId: z.string().min(1), roomId: z.string().min(1), checkIn: z.string().refine(isIsoDate) });

/** Step 1 of a drag: check availability and price, change nothing. */
export async function previewMove(_p: Result, form: FormData): Promise<ActionResult<MovePlan>> {
  return staffAction("calendar", async () => {
    const plan = await moveBooking(moveSchema.parse(Object.fromEntries(form)), { dryRun: true });
    return { ok: true, data: plan };
  });
}

/** Step 2, after the confirmation: do it (availability is checked again under locks) and log old → new. */
export async function applyMove(_p: Result, form: FormData): Promise<ActionResult<MovePlan>> {
  return staffAction("bookings", async (user) => {
    const plan = await moveBooking(moveSchema.parse(Object.fromEntries(form)));
    await logActivity({
      userId: user.id, action: "booking.calendar_move", entity: "Booking", entityId: plan.bookingId,
      summary: `${plan.code}: ${plan.rooms.map((r) => `room ${r.from} → ${r.to}`).join(", ") || "same room"}${plan.repriced ? `; ${plan.from.checkIn}→${plan.from.checkOut} moved to ${plan.to.checkIn}→${plan.to.checkOut}; total ${plan.oldTotal / 100} → ${plan.newTotal / 100} GEL` : ""}`,
      before: { rooms: plan.rooms.map((r) => r.from), ...plan.from, total: plan.oldTotal }, after: { rooms: plan.rooms.map((r) => r.to), ...plan.to, total: plan.newTotal }, ip: await clientIp(),
    });
    done(plan.code);
    revalidatePath("/admin/calendar");
    return { ok: true, message: "booking_moved", data: plan };
  });
}

// ───────────────────────────── Booking helpers ─────────────────────────────

/** Sends the guest the confirmation e-mail + PDF voucher again (no new alert to the hotel). */
export async function adminResendConfirmation(_p: Result, form: FormData): Promise<Result> {
  return staffAction("bookings", async (user) => {
    const b = await bookingByCode(String(form.get("code")));
    if (!["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(b.status)) throw new BookingError("bad_transition");
    const guest = b.guestId ? await db.guest.findUnique({ where: { id: b.guestId } }) : null;
    if (!guest?.email || guest.email.endsWith("@guests.royalehotel.local")) throw new ActionError("no_guest_email");
    const ok = await notifyBookingConfirmed(b.id, { hotel: false });
    if (!ok) throw new ActionError("email_failed");
    await logActivity({ userId: user.id, action: "booking.resend_confirmation", entity: "Booking", entityId: b.id, summary: `${b.code}: confirmation re-sent to ${guest.email}` });
    return { ok: true, message: "confirmation_sent", values: { email: guest.email } };
  });
}
