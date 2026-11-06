"use server";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { tr } from "@/lib/i18n-content";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isIsoDate } from "@/lib/booking/dates";
import {
  BookingError, finalizeBooking, holdRooms, loadSettings, logActivity, quoteCart, releaseHold, searchAvailability,
} from "@/lib/booking/service";
import { bookingAccess, grantBookingAccess } from "@/lib/booking/guest-session";
import { notifyBookingConfirmed } from "@/lib/notify/booking-mail";
import { activeProvider, startPayment } from "@/lib/payments";
import type { Quote } from "@/lib/booking/engine";

type Fail = { ok: false; error: string; detail?: string };
const fail = (e: unknown): Fail => {
  if (e instanceof BookingError) return { ok: false, error: e.code.startsWith("promo_") ? "promo" : e.code, detail: e.message };
  console.error("[checkout]", e);
  return { ok: false, error: "generic" };
};

const childAges = z.array(z.number().int().min(0).max(17)).max(8);
const stay = z.object({ checkIn: z.string().refine(isIsoDate), checkOut: z.string().refine(isIsoDate) });

// ───────────────────────────── 1. Search ─────────────────────────────

export type RoomOption = {
  roomTypeId: string; slug: string; name: string; image: { url: string; blur: string | null } | null; sizeM2: number | null;
  maxAdults: number; maxChildren: number; maxOccupancy: number; status: string; roomsLeft: number; minStay: number;
  averageNightly: number; roomTotal: number; nights: number; fitsParty: boolean;
};

export async function searchRooms(input: { checkIn: string; checkOut: string; adults: number; childAges: number[]; locale: string }): Promise<{ ok: true; rooms: RoomOption[] } | Fail> {
  const p = stay.extend({ adults: z.number().int().min(1).max(12), childAges, locale: z.string().max(5) }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid" };
  if (!(await rateLimit("search", 90, 60))) return { ok: false, error: "rate_limited" };
  try {
    const [avail, types] = await Promise.all([
      searchAvailability(p.data),
      db.roomType.findMany({ where: { active: true }, include: { photos: { include: { media: true }, orderBy: { sortOrder: "asc" }, take: 1 } } }),
    ]);
    const byId = new Map(types.map((t) => [t.id, t]));
    const order = { available: 0, min_stay: 1, sold_out: 2, closed: 3, too_small: 4 } as Record<string, number>;
    const rooms = avail.map((a): RoomOption => {
      const t = byId.get(a.roomTypeId)!;
      const m = t.photos[0]?.media;
      return {
        roomTypeId: t.id, slug: t.slug, name: tr(t.name, p.data.locale), image: m ? { url: m.url, blur: m.blurDataUrl } : null, sizeM2: t.sizeM2,
        maxAdults: t.maxAdults, maxChildren: t.maxChildren, maxOccupancy: t.maxOccupancy, status: a.status, roomsLeft: a.roomsLeft, minStay: a.minStay,
        averageNightly: a.averageNightly, roomTotal: a.roomTotal, nights: a.nightly.length, fitsParty: a.fitsParty,
      };
    }).sort((x, y) => order[x.status] - order[y.status] || Number(y.fitsParty) - Number(x.fitsParty) || x.averageNightly - y.averageNightly);
    return { ok: true, rooms };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── 2. Hold (start checkout) ─────────────────────────────

const line = z.object({ roomTypeId: z.string().min(1).max(40), adults: z.number().int().min(1).max(6), childAges });

export async function startCheckout(input: { checkIn: string; checkOut: string; lines: z.infer<typeof line>[]; locale: string; previousHoldId?: string | null }) {
  const p = stay.extend({ lines: z.array(line).min(1).max(10), locale: z.string().max(5), previousHoldId: z.string().max(40).nullish() }).safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" };
  if (!(await rateLimit("hold", 20, 600))) return { ok: false as const, error: "rate_limited" };
  try {
    if (p.data.previousHoldId && (await bookingAccess()) === p.data.previousHoldId) await releaseHold(p.data.previousHoldId);
    const hold = await holdRooms(p.data);
    await grantBookingAccess(hold.holdId);
    return { ok: true as const, ...hold };
  } catch (e) {
    return fail(e);
  }
}

export async function abandonCheckout(holdId: string) {
  if ((await bookingAccess()) === holdId) await releaseHold(holdId).catch(() => undefined);
}

// ───────────────────────────── Options & quote ─────────────────────────────

export async function checkoutOptions(locale: string) {
  const [settings, extras, provider] = await Promise.all([loadSettings(), db.extra.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }), activeProvider()]);
  return {
    extras: extras.map((e) => ({ id: e.id, key: e.key, icon: e.icon, name: tr(e.name, locale), description: tr(e.description, locale), price: e.price, unit: e.unit })),
    plans: {
      pay_at_hotel: settings.booking.allowPayAtHotel,
      deposit: settings.booking.allowDeposit && !!provider,
      full: settings.booking.allowFullPrepay && !!provider,
    },
    depositPercent: settings.booking.depositPercent,
    freeCancellationDays: settings.booking.freeCancellationDays,
    holdMinutes: settings.booking.holdMinutes,
  };
}

const extrasSchema = z.array(z.object({ extraId: z.string().min(1).max(40), quantity: z.number().int().min(0).max(10) })).max(20);

/** Server-computed price for the held rooms + chosen extras + promo. The browser only displays it. */
export async function quoteHold(input: { holdId: string; extras: { extraId: string; quantity: number }[]; promoCode?: string }): Promise<{ ok: true; quote: Quote; deposit: number } | Fail> {
  const p = z.object({ holdId: z.string().max(40), extras: extrasSchema, promoCode: z.string().max(40).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid" };
  if ((await bookingAccess()) !== p.data.holdId) return { ok: false, error: "hold_expired" };
  try {
    const b = await db.booking.findUnique({ where: { id: p.data.holdId }, include: { rooms: { orderBy: { createdAt: "asc" } } } });
    if (!b || b.status !== "PENDING") return { ok: false, error: "hold_expired" };
    const { quote, settings } = await quoteCart({
      checkIn: b.checkIn.toISOString().slice(0, 10), checkOut: b.checkOut.toISOString().slice(0, 10),
      lines: b.rooms.map((r) => ({ roomTypeId: r.roomTypeId!, adults: r.adults, childAges: r.childAges })),
      extras: p.data.extras, promoCode: p.data.promoCode,
    });
    return { ok: true, quote, deposit: Math.max(1, Math.round((quote.grandTotal * settings.booking.depositPercent) / 100)) };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── 3. Complete ─────────────────────────────

const guestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  arrivalTime: z.string().max(20).optional().or(z.literal("")),
  specialRequests: z.string().max(1000).optional().or(z.literal("")),
  marketingConsent: z.boolean().optional(),
});

export async function completeCheckout(input: {
  holdId: string; guest: z.infer<typeof guestSchema>; extras: { extraId: string; quantity: number }[];
  promoCode?: string; plan: "pay_at_hotel" | "deposit" | "full"; acceptPolicies: boolean; locale: string;
}): Promise<{ ok: true; status: "confirmed"; code: string; email: string } | { ok: true; status: "redirect"; url: string } | (Fail & { fields?: string[] })> {
  const p = z.object({
    holdId: z.string().max(40), guest: guestSchema, extras: extrasSchema, promoCode: z.string().max(40).optional(),
    plan: z.enum(["pay_at_hotel", "deposit", "full"]), acceptPolicies: z.literal(true), locale: z.string().max(5),
  }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid", fields: [...new Set(p.error.issues.map((i) => String(i.path.at(-1))))] };
  if (!(await rateLimit("checkout", 10, 600))) return { ok: false, error: "rate_limited" };
  if ((await bookingAccess()) !== p.data.holdId) return { ok: false, error: "hold_expired" };
  try {
    const res = await finalizeBooking({ holdId: p.data.holdId, guest: p.data.guest, extras: p.data.extras, promoCode: p.data.promoCode || null, plan: p.data.plan });
    const ip = await clientIp();
    if (res.confirmed) {
      after(async () => {
        await logActivity({ action: "booking.create", entity: "Booking", entityId: res.booking.id, summary: `Online booking ${res.booking.code} (pay at hotel)`, ip });
        await notifyBookingConfirmed(res.booking.id);
      });
      return { ok: true, status: "confirmed", code: res.booking.code, email: p.data.guest.email };
    }
    const settings = await loadSettings();
    const pay = await startPayment(res.booking.id, res.amountDue, p.data.locale, settings.booking.holdMinutes);
    after(() => logActivity({ action: "payment.start", entity: "Booking", entityId: res.booking.id, summary: `Online payment started (${p.data.plan})`, ip }));
    return { ok: true, status: "redirect", url: pay.redirectUrl };
  } catch (e) {
    return fail(e);
  }
}
