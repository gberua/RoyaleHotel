/**
 * Booking service — database side of the booking engine.
 *
 * Double-booking protection (defence in depth):
 *  1. Every hold/confirm runs in a transaction that LOCKS the candidate Room rows (SELECT … FOR UPDATE,
 *     always in id order to avoid deadlocks), so concurrent checkouts for the same room type are serialized.
 *  2. Inside the lock, free rooms are recomputed from active allocations (expired holds released first).
 *  3. A PostgreSQL EXCLUDE constraint on RoomAllocation (room × date range, active rows) makes an
 *     overlapping allocation physically impossible even if application code were wrong.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { settingsSchema, type Settings } from "@/lib/settings-schema";
import {
  amountDue, arrivalAllowed, buildQuote, penaltyAmount, cancellationTerms, checkRestrictions, nightlyPrices, occupancyFits,
  type ExtraDef, type OccupancyRuleDef, type PromoDef, type Quote, type RateOverride, type RateRoomType, type RateSeason,
} from "./engine";
import { addDaysIso, isIsoDate, nightsBetween, nowInGeorgia, toDate } from "./dates";

type Tx = Prisma.TransactionClient;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export class BookingError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

// ───────────────────────────── Settings & rate context ─────────────────────────────

export async function loadSettings(client: Tx | typeof db = db): Promise<Settings> {
  const rows = await client.setting.findMany();
  const parsed = settingsSchema.safeParse(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export type RoomTypeCtx = RateRoomType & { roomIds: string[]; active: boolean };

export async function loadRateContext(checkIn: string, checkOut: string, client: Tx | typeof db = db) {
  const start = toDate(checkIn);
  const end = toDate(checkOut);
  const [types, seasons, overrides, rules, extras] = await Promise.all([
    client.roomType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { rooms: { where: { active: true, housekeeping: { not: "OUT_OF_ORDER" } }, select: { id: true }, orderBy: { number: "asc" } } },
    }),
    client.season.findMany({ where: { startDate: { lte: end }, endDate: { gte: start } }, include: { rates: true } }),
    client.rateOverride.findMany({ where: { date: { gte: start, lt: end } } }),
    client.occupancyRule.findMany(),
    client.extra.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    types: types.map((t): RoomTypeCtx => ({
      id: t.id, slug: t.slug, basePrice: t.basePrice, weekendPrice: t.weekendPrice, minStay: t.minStay,
      maxAdults: t.maxAdults, maxChildren: t.maxChildren, maxOccupancy: t.maxOccupancy, baseOccupancy: t.baseOccupancy,
      roomIds: t.rooms.map((r) => r.id), active: t.active,
    })),
    seasons: seasons.map((s): RateSeason => ({
      id: s.id, startDate: iso(s.startDate)!, endDate: iso(s.endDate)!,
      rates: s.rates.map((r) => ({ roomTypeId: r.roomTypeId, price: r.price, weekendPrice: r.weekendPrice, minStay: r.minStay })),
    })),
    overrides: overrides.map((o): RateOverride => ({ roomTypeId: o.roomTypeId, date: iso(o.date)!, price: o.price, minStay: o.minStay, closed: o.closed, closedToArrival: o.closedToArrival })),
    rules: rules.map((r): OccupancyRuleDef => ({ kind: r.kind, minAge: r.minAge, maxAge: r.maxAge, pricePerNight: r.pricePerNight, percentOfRoom: r.percentOfRoom })),
    extras: extras.map((e): ExtraDef => ({ id: e.id, key: e.key, price: e.price, unit: e.unit, active: e.active })),
  };
}

/** Room ids that have an ACTIVE allocation overlapping [checkIn, checkOut). Expired holds don't count. */
async function busyRoomIds(client: Tx | typeof db, roomIds: string[], checkIn: string, checkOut: string, excludeBookingId?: string) {
  if (!roomIds.length) return new Set<string>();
  const rows = await client.roomAllocation.findMany({
    where: {
      roomId: { in: roomIds },
      active: true,
      checkIn: { lt: toDate(checkOut) },
      checkOut: { gt: toDate(checkIn) },
      OR: [{ kind: { not: "HOLD" } }, { holdExpiresAt: { gt: new Date() } }],
      ...(excludeBookingId ? { NOT: { bookingId: excludeBookingId } } : {}),
    },
    select: { roomId: true },
  });
  return new Set(rows.map((r) => r.roomId));
}

// ───────────────────────────── Expiry ─────────────────────────────

/**
 * Releases expired holds and expires unpaid pending bookings. Called lazily before every search / hold,
 * by the 15-minute maintenance job, and safe to call any time (idempotent).
 */
export async function releaseExpired(client: Tx | typeof db = db) {
  const now = new Date();
  const expired = await client.booking.findMany({ where: { status: "PENDING", holdExpiresAt: { lt: now } }, select: { id: true } });
  if (expired.length) {
    const ids = expired.map((b) => b.id);
    await client.roomAllocation.updateMany({ where: { bookingId: { in: ids }, active: true }, data: { active: false } });
    await client.booking.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "EXPIRED", cancelReason: "Payment / checkout not completed in time — room released" } });
  }
  const holds = await client.roomAllocation.updateMany({ where: { kind: "HOLD", active: true, holdExpiresAt: { lt: now } }, data: { active: false } });
  return { bookings: expired.length, holds: holds.count };
}

// ───────────────────────────── Search ─────────────────────────────

export type StayQuery = { checkIn: string; checkOut: string; adults: number; childAges: number[] };

export function validateStay(q: { checkIn: string; checkOut: string }, settings: Settings, opts: { staff?: boolean } = {}) {
  if (!isIsoDate(q.checkIn) || !isIsoDate(q.checkOut) || q.checkOut <= q.checkIn) throw new BookingError("invalid_dates");
  const now = nowInGeorgia();
  // Staff (walk-ins at the desk) may book today at any hour; guests online only until the cutoff
  const cutoff = opts.staff ? "24:00" : settings.booking.sameDayCutoff;
  if (!arrivalAllowed(q.checkIn, now.date, now.time, cutoff)) throw new BookingError(q.checkIn < now.date ? "past" : "same_day_cutoff");
  if (nightsBetween(q.checkIn, q.checkOut) > 30) throw new BookingError("too_long");
  if (nightsBetween(now.date, q.checkIn) > settings.booking.maxAdvanceDays) throw new BookingError("too_far");
}

export type TypeAvailability = {
  roomTypeId: string; slug: string;
  status: "available" | "sold_out" | "min_stay" | "too_small" | "closed";
  roomsLeft: number; minStay: number; nightly: number[]; roomTotal: number; averageNightly: number; fitsParty: boolean;
};

export async function searchAvailability(q: StayQuery): Promise<TypeAvailability[]> {
  const settings = await loadSettings();
  validateStay(q, settings);
  await releaseExpired();
  const ctx = await loadRateContext(q.checkIn, q.checkOut);
  const busy = await busyRoomIds(db, ctx.types.flatMap((t) => t.roomIds), q.checkIn, q.checkOut);
  return ctx.types.map((t) => {
    const nights = nightlyPrices(t, ctx.seasons, ctx.overrides, q.checkIn, q.checkOut);
    const r = checkRestrictions(t, ctx.seasons, ctx.overrides, q.checkIn, q.checkOut);
    const roomsLeft = t.roomIds.filter((id) => !busy.has(id)).length;
    const fitsParty = occupancyFits(t, q.adults, q.childAges);
    const total = nights.reduce((a, n) => a + n.price, 0);
    const status: TypeAvailability["status"] = !r.ok ? (r.reason === "min_stay" ? "min_stay" : "closed") : roomsLeft === 0 ? "sold_out" : "available";
    return {
      roomTypeId: t.id, slug: t.slug, status, roomsLeft, minStay: r.minStay, nightly: nights.map((n) => n.price),
      roomTotal: total, averageNightly: Math.round(total / Math.max(1, nights.length)), fitsParty,
    };
  });
}

// ───────────────────────────── Quote ─────────────────────────────

export type CartLine = { roomTypeId: string; adults: number; childAges: number[] };
export type CartInput = { checkIn: string; checkOut: string; lines: CartLine[]; extras: { extraId: string; quantity: number }[]; promoCode?: string | null };

async function findPromo(client: Tx | typeof db, code?: string | null): Promise<PromoDef | null> {
  if (!code?.trim()) return null;
  const p = await client.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!p) return { id: "", code: code.trim().toUpperCase(), type: "PERCENT", value: 0, active: false, validFrom: null, validTo: null, stayFrom: null, stayTo: null, minNights: null, maxUses: null, usedCount: 0 };
  return { id: p.id, code: p.code, type: p.type, value: p.value, active: p.active, validFrom: iso(p.validFrom), validTo: iso(p.validTo), stayFrom: iso(p.stayFrom), stayTo: iso(p.stayTo), minNights: p.minNights, maxUses: p.maxUses, usedCount: p.usedCount, roomTypeIds: p.roomTypeIds };
}

/** Canonical server-side price. Never uses prices sent by the browser. */
export async function quoteCart(cart: CartInput, client: Tx | typeof db = db): Promise<{ quote: Quote; settings: Settings; ctx: Awaited<ReturnType<typeof loadRateContext>> }> {
  const settings = await loadSettings(client);
  if (!cart.lines.length) throw new BookingError("empty_cart");
  if (cart.lines.length > settings.booking.maxRoomsPerBooking) throw new BookingError("too_many_rooms");
  const ctx = await loadRateContext(cart.checkIn, cart.checkOut, client);
  const rooms = cart.lines.map((l) => {
    const rt = ctx.types.find((t) => t.id === l.roomTypeId);
    if (!rt) throw new BookingError("unknown_room_type");
    if (!occupancyFits(rt, l.adults, l.childAges)) throw new BookingError("occupancy", rt.slug);
    const r = checkRestrictions(rt, ctx.seasons, ctx.overrides, cart.checkIn, cart.checkOut);
    if (!r.ok) throw new BookingError(r.reason, rt.slug);
    return { roomType: rt, adults: l.adults, childAges: l.childAges };
  });
  const extras = cart.extras
    .map((e) => ({ extra: ctx.extras.find((x) => x.id === e.extraId), quantity: Math.min(10, Math.max(0, Math.floor(e.quantity))) }))
    .filter((e): e is { extra: ExtraDef; quantity: number } => !!e.extra);
  const quote = buildQuote({
    checkIn: cart.checkIn, checkOut: cart.checkOut, rooms, seasons: ctx.seasons, overrides: ctx.overrides,
    occupancyRules: ctx.rules, extras, promo: await findPromo(client, cart.promoCode), bookingDate: nowInGeorgia().date,
    cityTaxPerPersonNight: settings.booking.cityTaxPerPersonNight, cityTaxChildren: settings.booking.cityTaxChildren,
  });
  return { quote, settings, ctx };
}

// ───────────────────────────── Codes ─────────────────────────────

export async function nextBookingCode(tx: Tx, year: number) {
  const rows = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "BookingSequence" ("year", "last") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "last" = "BookingSequence"."last" + 1
    RETURNING "last"`;
  return `RH-${year}-${String(rows[0].last).padStart(4, "0")}`;
}

// ───────────────────────────── Hold ─────────────────────────────

async function lockRooms(tx: Tx, roomIds: string[]) {
  if (!roomIds.length) return;
  await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ANY(${roomIds}::text[]) ORDER BY id FOR UPDATE`;
}

/** Pick a free physical room for every cart line and write HOLD allocations. Must run inside a transaction. */
async function allocate(tx: Tx, args: { bookingId: string; checkIn: string; checkOut: string; lines: (CartLine & { nightly: number[]; extraGuestTotal: number })[]; kind: "HOLD" | "BOOKING"; holdExpiresAt: Date | null; types: RoomTypeCtx[]; preferRoomIds?: (string | undefined)[] }) {
  const involved = [...new Set(args.lines.map((l) => l.roomTypeId))].flatMap((id) => args.types.find((t) => t.id === id)?.roomIds ?? []);
  await lockRooms(tx, involved);
  const busy = await busyRoomIds(tx, involved, args.checkIn, args.checkOut, args.bookingId);
  const taken = new Set<string>();
  for (const [i, line] of args.lines.entries()) {
    const rt = args.types.find((t) => t.id === line.roomTypeId)!;
    const prefer = args.preferRoomIds?.[i];
    const candidates = prefer ? [prefer, ...rt.roomIds.filter((id) => id !== prefer)] : rt.roomIds;
    const roomId = candidates.find((id) => !busy.has(id) && !taken.has(id));
    if (!roomId) throw new BookingError("sold_out", rt.slug);
    taken.add(roomId);
    await tx.roomAllocation.create({
      data: {
        bookingId: args.bookingId, roomId, roomTypeId: rt.id, checkIn: toDate(args.checkIn), checkOut: toDate(args.checkOut),
        kind: args.kind, active: true, holdExpiresAt: args.holdExpiresAt, adults: line.adults, children: line.childAges.length,
        childAges: line.childAges, nightlyPrices: line.nightly, extraGuestTotal: line.extraGuestTotal,
      },
    });
  }
}

function isExclusionViolation(e: unknown) {
  const msg = String((e as { message?: string })?.message ?? e);
  return msg.includes("RoomAllocation_no_overlap") || msg.includes("23P01") || msg.includes("exclusion constraint");
}

const TX = { isolationLevel: "ReadCommitted" as const, timeout: 20_000, maxWait: 10_000 };

/**
 * Step 1 of checkout: place a temporary HOLD on specific rooms (default 15 minutes).
 * Returns the pending booking id and when the hold expires.
 */
export async function holdRooms(input: { checkIn: string; checkOut: string; lines: CartLine[]; locale: string; staff?: boolean }) {
  const settings = await loadSettings();
  validateStay(input, settings, { staff: input.staff });
  await releaseExpired();
  try {
    return await db.$transaction(async (tx) => {
      const { quote, ctx } = await quoteCart({ checkIn: input.checkIn, checkOut: input.checkOut, lines: input.lines, extras: [] }, tx);
      const holdExpiresAt = new Date(Date.now() + settings.booking.holdMinutes * 60_000);
      const booking = await tx.booking.create({
        data: {
          code: `HOLD-${crypto.randomUUID()}`, status: "PENDING", source: "DIRECT",
          checkIn: toDate(input.checkIn), checkOut: toDate(input.checkOut),
          adults: input.lines.reduce((a, l) => a + l.adults, 0), children: input.lines.reduce((a, l) => a + l.childAges.length, 0),
          childAges: input.lines.flatMap((l) => l.childAges), locale: input.locale,
          roomsTotal: quote.roomsTotal, grandTotal: quote.grandTotal, holdExpiresAt, guestCount: quote.guests,
        },
      });
      await allocate(tx, {
        bookingId: booking.id, checkIn: input.checkIn, checkOut: input.checkOut, kind: "HOLD", holdExpiresAt, types: ctx.types,
        lines: input.lines.map((l, i) => ({ ...l, nightly: quote.rooms[i].nights.map((n) => n.price), extraGuestTotal: quote.rooms[i].extraGuestTotal })),
      });
      return { holdId: booking.id, holdExpiresAt: holdExpiresAt.toISOString() };
    }, TX);
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("sold_out");
    throw e;
  }
}

export async function releaseHold(holdId: string) {
  await db.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: holdId } });
    if (!b || b.status !== "PENDING" || b.guestId) return;
    await tx.roomAllocation.updateMany({ where: { bookingId: holdId }, data: { active: false } });
    await tx.booking.update({ where: { id: holdId }, data: { status: "EXPIRED", cancelReason: "Guest left checkout" } });
  });
}

// ───────────────────────────── Finalize (guest details, extras, promo, plan) ─────────────────────────────

export type GuestDetails = { firstName: string; lastName: string; email: string; phone: string; country?: string; arrivalTime?: string; specialRequests?: string; marketingConsent?: boolean };
export type PaymentPlan = "pay_at_hotel" | "deposit" | "full";

/**
 * Step 2 of checkout. Re-prices everything on the server from the held allocations, attaches the guest,
 * extras and promo. For "pay at hotel" the booking is confirmed immediately; for deposit / full prepayment
 * it stays PENDING (hold extended) until the payment provider confirms.
 */
export async function finalizeBooking(input: {
  holdId: string; guest: GuestDetails; extras: { extraId: string; quantity: number }[]; promoCode?: string | null;
  plan: PaymentPlan; source?: "DIRECT" | "PHONE" | "WALK_IN" | "WHATSAPP" | "OTHER"; staffConfirm?: boolean;
}) {
  const settings = await loadSettings();
  const planAllowed = input.staffConfirm || (input.plan === "pay_at_hotel" ? settings.booking.allowPayAtHotel : input.plan === "deposit" ? settings.booking.allowDeposit : settings.booking.allowFullPrepay);
  if (!planAllowed) throw new BookingError("plan_not_allowed");

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.holdId} FOR UPDATE`;
    const b = await tx.booking.findUnique({ where: { id: input.holdId }, include: { rooms: true } });
    if (!b) throw new BookingError("not_found");
    if (b.status !== "PENDING") throw new BookingError(b.status === "EXPIRED" ? "hold_expired" : "not_pending");
    const checkIn = iso(b.checkIn)!, checkOut = iso(b.checkOut)!;

    // Hold expired but rooms possibly still free → re-acquire under lock (never silently double-book)
    const holdsAlive = b.rooms.length > 0 && b.rooms.every((r) => r.active && (!r.holdExpiresAt || r.holdExpiresAt > new Date()));
    const lines: CartLine[] = b.rooms.map((r) => ({ roomTypeId: r.roomTypeId!, adults: r.adults, childAges: r.childAges }));
    const { quote, ctx } = await quoteCart({ checkIn, checkOut, lines, extras: input.extras, promoCode: input.promoCode }, tx);
    if (input.promoCode && !quote.promo) throw new BookingError("promo_" + (quote.promoError ?? "invalid"));
    if (!holdsAlive) {
      const preferRoomIds = b.rooms.map((r) => r.roomId);
      await tx.roomAllocation.deleteMany({ where: { bookingId: b.id } });
      await allocate(tx, { bookingId: b.id, checkIn, checkOut, kind: "HOLD", holdExpiresAt: new Date(Date.now() + 60_000), types: ctx.types, preferRoomIds,
        lines: lines.map((l, i) => ({ ...l, nightly: quote.rooms[i].nights.map((n) => n.price), extraGuestTotal: quote.rooms[i].extraGuestTotal })) });
    }

    // Promo usage limits — per guest, then the total (atomic conditional increment)
    let promoCodeId: string | null = null;
    if (quote.promo) {
      const promoRow = await tx.promoCode.findUnique({ where: { code: quote.promo.code } });
      if (promoRow?.perGuestLimit != null) {
        const used = await tx.booking.count({ where: { promoCodeId: promoRow.id, guest: { email: input.guest.email.trim().toLowerCase() }, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] }, NOT: { id: b.id } } });
        if (used >= promoRow.perGuestLimit) throw new BookingError("promo_guest_limit");
      }
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "PromoCode" SET "usedCount" = "usedCount" + 1
        WHERE code = ${quote.promo.code} AND active AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
        RETURNING id`;
      if (!rows.length) throw new BookingError("promo_used_up");
      promoCodeId = rows[0].id;
    }

    const email = input.guest.email.trim().toLowerCase();
    const guest = await tx.guest.upsert({
      where: { email },
      update: { firstName: input.guest.firstName, lastName: input.guest.lastName, phone: input.guest.phone, country: input.guest.country || undefined, locale: b.locale, ...(input.guest.marketingConsent ? { marketingConsent: true } : {}) },
      create: { email, firstName: input.guest.firstName, lastName: input.guest.lastName, phone: input.guest.phone, country: input.guest.country || null, locale: b.locale, marketingConsent: !!input.guest.marketingConsent },
    });

    await tx.bookingExtra.deleteMany({ where: { bookingId: b.id } });
    if (quote.extras.length) {
      await tx.bookingExtra.createMany({ data: quote.extras.map((e) => ({ bookingId: b.id, extraId: e.extraId, quantity: e.quantity, unitPrice: e.unitPrice, total: e.total })) });
    }
    // Store the exact nightly prices on each allocation (what the guest saw)
    const allocs = await tx.roomAllocation.findMany({ where: { bookingId: b.id }, orderBy: { createdAt: "asc" } });
    for (const [i, a] of allocs.entries()) {
      await tx.roomAllocation.update({ where: { id: a.id }, data: { nightlyPrices: quote.rooms[i].nights.map((n) => n.price), extraGuestTotal: quote.rooms[i].extraGuestTotal } });
    }

    const due = amountDue(input.plan, quote.grandTotal, settings.booking.depositPercent);
    const terms = { freeCancellationDays: settings.booking.freeCancellationDays, penalty: settings.booking.lateCancellationPenalty };
    const confirmNow = input.plan === "pay_at_hotel" || input.staffConfirm;
    const holdExpiresAt = confirmNow ? null : new Date(Date.now() + settings.booking.holdMinutes * 60_000);
    const code = confirmNow ? await nextBookingCode(tx, new Date().getFullYear()) : b.code;

    const updated = await tx.booking.update({
      where: { id: b.id },
      data: {
        code, guestId: guest.id, status: confirmNow ? "CONFIRMED" : "PENDING", confirmedAt: confirmNow ? new Date() : null,
        source: input.source ?? "DIRECT", paymentPlan: input.plan, paymentMethod: input.plan === "pay_at_hotel" ? "pay_at_hotel" : settings.booking.paymentProvider,
        roomsTotal: quote.roomsTotal + quote.extraGuestsTotal, extrasTotal: quote.extrasTotal, discountTotal: quote.discountTotal,
        taxTotal: quote.taxTotal, grandTotal: quote.grandTotal, depositDue: due, promoCodeId, guestCount: quote.guests,
        arrivalTime: input.guest.arrivalTime || null, specialRequests: input.guest.specialRequests?.slice(0, 2000) || null,
        cancellationPolicy: terms, priceBreakdown: quote as unknown as Prisma.InputJsonValue, holdExpiresAt,
      },
    });
    await tx.roomAllocation.updateMany({
      where: { bookingId: b.id },
      data: confirmNow ? { kind: "BOOKING", holdExpiresAt: null } : { holdExpiresAt },
    });
    return { booking: updated, quote, amountDue: due, confirmed: !!confirmNow };
  }, TX).catch((e) => {
    if (isExclusionViolation(e)) throw new BookingError("sold_out");
    throw e;
  });
  return result;
}

// ───────────────────────────── Payment confirmation ─────────────────────────────

/**
 * Called when the payment provider reports success (after the provider's status was verified server-side).
 * Idempotent: a repeated callback for an already confirmed booking only records nothing new.
 */
export async function confirmPaidBooking(bookingId: string, payment: { provider: string; providerRef: string; amount: number; raw?: unknown }) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { rooms: true } });
    if (!b) throw new BookingError("not_found");
    const existing = await tx.payment.findFirst({ where: { bookingId, providerRef: payment.providerRef, status: "succeeded" } });
    if (existing) return { booking: b, alreadyProcessed: true, conflict: false };

    let conflict = false;
    if (b.status === "PENDING" || b.status === "EXPIRED") {
      // If the hold lapsed while the guest was paying, try to re-acquire the same rooms
      const allActive = b.rooms.length > 0 && b.rooms.every((r) => r.active);
      if (!allActive) {
        try {
          await tx.$executeRaw`SAVEPOINT reacquire`;
          await tx.roomAllocation.updateMany({ where: { bookingId }, data: { active: true } });
          await tx.$executeRaw`RELEASE SAVEPOINT reacquire`;
        } catch (e) {
          if (!isExclusionViolation(e)) throw e;
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT reacquire`;
          conflict = true; // paid, but the room was taken meanwhile → staff must resolve + refund
        }
      }
    }
    const pending = await tx.payment.findFirst({ where: { bookingId, providerRef: payment.providerRef } });
    const payData = { status: "succeeded", amount: payment.amount, raw: (payment.raw ?? undefined) as Prisma.InputJsonValue };
    if (pending) await tx.payment.update({ where: { id: pending.id }, data: payData });
    else await tx.payment.create({ data: { bookingId, provider: payment.provider, providerRef: payment.providerRef, ...payData } });
    const amountPaid = b.amountPaid + payment.amount;
    const code = b.code.startsWith("HOLD-") ? await nextBookingCode(tx, new Date().getFullYear()) : b.code;
    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        code, amountPaid, paymentStatus: amountPaid >= b.grandTotal ? "PAID" : "DEPOSIT_PAID",
        ...(conflict ? {} : { status: b.status === "PENDING" || b.status === "EXPIRED" ? "CONFIRMED" : b.status, confirmedAt: b.confirmedAt ?? new Date(), holdExpiresAt: null }),
      },
    });
    if (!conflict) await tx.roomAllocation.updateMany({ where: { bookingId }, data: { kind: "BOOKING", holdExpiresAt: null, active: true } });
    else await tx.bookingNote.create({ data: { bookingId, body: "⚠️ Payment received after the hold expired and the room was taken. Re-assign a room or refund the guest." } });
    return { booking, alreadyProcessed: false, conflict };
  }, TX);
}

export async function recordFailedPayment(bookingId: string, payment: { provider: string; providerRef: string; amount: number; status: "failed" | "cancelled"; raw?: unknown }) {
  const existing = await db.payment.findFirst({ where: { bookingId, providerRef: payment.providerRef } });
  if (existing?.status === "succeeded") return; // never downgrade a successful payment
  const data = { status: payment.status, amount: payment.amount, raw: (payment.raw ?? undefined) as Prisma.InputJsonValue };
  if (existing) await db.payment.update({ where: { id: existing.id }, data });
  else await db.payment.create({ data: { bookingId, provider: payment.provider, providerRef: payment.providerRef, ...data } });
}

// ───────────────────────────── Cancellation ─────────────────────────────

export async function cancellationPreview(bookingId: string) {
  const [b, settings] = await Promise.all([db.booking.findUnique({ where: { id: bookingId }, include: { rooms: true } }), loadSettings()]);
  if (!b) throw new BookingError("not_found");
  return cancellationTerms({
    checkIn: iso(b.checkIn)!, todayLocal: nowInGeorgia().date, freeDays: settings.booking.freeCancellationDays,
    amountPaid: b.amountPaid, grandTotal: b.grandTotal, firstNights: b.rooms.filter((r) => r.kind === "BOOKING").map((r) => r.nightlyPrices[0] ?? 0),
    penaltyRule: settings.booking.lateCancellationPenalty, penaltyPercent: settings.booking.lateCancellationPercent,
  });
}

export async function cancelBooking(bookingId: string, reason: string) {
  const terms = await cancellationPreview(bookingId);
  const booking = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    const b = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new BookingError("not_found");
    if (!["PENDING", "CONFIRMED"].includes(b.status)) throw new BookingError("not_cancellable");
    await tx.roomAllocation.updateMany({ where: { bookingId }, data: { active: false } });
    return tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.slice(0, 500), refundAmount: terms.refund, penaltyAmount: terms.penalty } });
  }, TX);
  return { booking, terms };
}

// ───────────────────────────── Staff operations ─────────────────────────────

/** Move one room of a booking to another physical room (any type) — the overlap constraint guards it. */
export async function moveAllocation(allocationId: string, newRoomId: string) {
  try {
    return await db.$transaction(async (tx) => {
      const a = await tx.roomAllocation.findUnique({ where: { id: allocationId } });
      if (!a) throw new BookingError("not_found");
      await lockRooms(tx, [a.roomId, newRoomId].sort());
      const busy = await busyRoomIds(tx, [newRoomId], iso(a.checkIn)!, iso(a.checkOut)!, a.bookingId ?? undefined);
      if (busy.has(newRoomId)) throw new BookingError("room_busy");
      const room = await tx.room.findUnique({ where: { id: newRoomId } });
      return tx.roomAllocation.update({ where: { id: allocationId }, data: { roomId: newRoomId, roomTypeId: room?.roomTypeId ?? a.roomTypeId } });
    }, TX);
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("room_busy");
    throw e;
  }
}

/** Change a booking's dates (extend / shorten / shift). Rooms stay the same; nights are re-priced. */
export async function changeDates(bookingId: string, checkIn: string, checkOut: string) {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) throw new BookingError("invalid_dates");
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
      const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { rooms: { where: { active: true } }, extras: true, promoCode: true } });
      if (!b) throw new BookingError("not_found");
      await lockRooms(tx, b.rooms.map((r) => r.roomId).sort());
      const busy = await busyRoomIds(tx, b.rooms.map((r) => r.roomId), checkIn, checkOut, bookingId);
      if (b.rooms.some((r) => busy.has(r.roomId))) throw new BookingError("room_busy");
      const lines = b.rooms.map((r) => ({ roomTypeId: r.roomTypeId!, adults: r.adults, childAges: r.childAges }));
      const { quote } = await quoteCart({ checkIn, checkOut, lines, extras: b.extras.map((e) => ({ extraId: e.extraId, quantity: e.quantity })) }, tx).catch((e) => {
        // Staff may override min-stay / closed restrictions when changing dates of an existing booking
        if (e instanceof BookingError && ["min_stay", "closed", "closed_to_arrival"].includes(e.code)) return quoteUnrestricted(tx, { checkIn, checkOut, lines, extras: b.extras.map((x) => ({ extraId: x.extraId, quantity: x.quantity })) });
        throw e;
      });
      for (const [i, r] of b.rooms.entries()) {
        await tx.roomAllocation.update({ where: { id: r.id }, data: { checkIn: toDate(checkIn), checkOut: toDate(checkOut), nightlyPrices: quote.rooms[i].nights.map((n) => n.price), extraGuestTotal: quote.rooms[i].extraGuestTotal } });
      }
      const discount = b.discountTotal; // keep the original promo amount
      const grandTotal = quote.roomsTotal + quote.extraGuestsTotal + quote.extrasTotal - discount + quote.taxTotal;
      return tx.booking.update({
        where: { id: bookingId },
        data: { checkIn: toDate(checkIn), checkOut: toDate(checkOut), roomsTotal: quote.roomsTotal + quote.extraGuestsTotal, extrasTotal: quote.extrasTotal, taxTotal: quote.taxTotal, grandTotal, priceBreakdown: { ...quote, discountTotal: discount, grandTotal } as unknown as Prisma.InputJsonValue },
      });
    }, TX);
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("room_busy");
    throw e;
  }
}

export type MovePlan = {
  code: string; bookingId: string;
  rooms: { allocationId: string; from: string; to: string }[];
  from: { checkIn: string; checkOut: string }; to: { checkIn: string; checkOut: string };
  oldTotal: number; newTotal: number; repriced: boolean; outOfOrder: string[];
};

/**
 * Drag-and-drop on the calendar: move one room of a booking to another room and/or shift the whole booking
 * to new dates (same length). Checks availability for every room of the booking on the new dates under row
 * locks; the database EXCLUDE constraint is the final guard. New dates are re-priced (the guest keeps the room
 * type they booked); a room change alone keeps the price. `dryRun` returns the plan without changing anything.
 */
export async function moveBooking(input: { allocationId: string; roomId: string; checkIn: string }, opts: { dryRun?: boolean } = {}): Promise<MovePlan> {
  if (!isIsoDate(input.checkIn)) throw new BookingError("invalid_dates");
  try {
    return await db.$transaction(async (tx) => {
      const a = await tx.roomAllocation.findUnique({ where: { id: input.allocationId } });
      if (!a?.bookingId || a.kind !== "BOOKING" || !a.active) throw new BookingError("not_found");
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${a.bookingId} FOR UPDATE`;
      const b = await tx.booking.findUniqueOrThrow({ where: { id: a.bookingId }, include: { rooms: { where: { active: true }, include: { room: { select: { number: true } } } }, extras: true } });
      if (!["PENDING", "CONFIRMED", "CHECKED_IN"].includes(b.status)) throw new BookingError("bad_transition");
      const oldIn = iso(b.checkIn)!, oldOut = iso(b.checkOut)!;
      const checkOut = addDaysIso(input.checkIn, nightsBetween(oldIn, oldOut));
      const shift = input.checkIn !== oldIn;
      if (shift && b.status === "CHECKED_IN") throw new BookingError("checked_in_dates");
      if (shift && input.checkIn < nowInGeorgia().date) throw new BookingError("past");
      const target = b.rooms.map((r) => ({ r, roomId: r.id === a.id ? input.roomId : r.roomId }));
      if (new Set(target.map((x) => x.roomId)).size !== target.length) throw new BookingError("room_busy");
      const newRoom = await tx.room.findUnique({ where: { id: input.roomId }, select: { id: true, number: true, roomTypeId: true, active: true, housekeeping: true } });
      if (!newRoom?.active) throw new BookingError("not_found");
      await lockRooms(tx, [...new Set([...b.rooms.map((r) => r.roomId), input.roomId])].sort());
      const busy = await busyRoomIds(tx, target.map((x) => x.roomId), input.checkIn, checkOut, b.id);
      if (busy.size) throw new BookingError("room_busy");

      let newTotal = b.grandTotal;
      let quote: Quote | null = null;
      if (shift) {
        const cart = { checkIn: input.checkIn, checkOut, lines: b.rooms.map((r) => ({ roomTypeId: r.roomTypeId!, adults: r.adults, childAges: r.childAges })), extras: b.extras.map((e) => ({ extraId: e.extraId, quantity: e.quantity })) };
        // staff may override min-stay / closed restrictions when moving an existing booking
        quote = (await quoteCart(cart, tx).catch((e) => {
          if (e instanceof BookingError && ["min_stay", "closed", "closed_to_arrival"].includes(e.code)) return quoteUnrestricted(tx, cart);
          throw e;
        })).quote;
        newTotal = quote.roomsTotal + quote.extraGuestsTotal + quote.extrasTotal - b.discountTotal + quote.taxTotal;
      }
      const plan: MovePlan = {
        code: b.code, bookingId: b.id,
        rooms: target.filter((x) => x.roomId !== x.r.roomId).map((x) => ({ allocationId: x.r.id, from: x.r.room.number, to: newRoom.number })),
        from: { checkIn: oldIn, checkOut: oldOut }, to: { checkIn: input.checkIn, checkOut },
        oldTotal: b.grandTotal, newTotal, repriced: shift, outOfOrder: newRoom.housekeeping === "OUT_OF_ORDER" && input.roomId !== a.roomId ? [newRoom.number] : [],
      };
      if (opts.dryRun) return plan;
      for (const [i, x] of target.entries()) {
        await tx.roomAllocation.update({
          where: { id: x.r.id },
          data: {
            roomId: x.roomId, ...(x.r.id === a.id && x.roomId !== x.r.roomId ? { roomTypeId: newRoom.roomTypeId } : {}),
            ...(shift ? { checkIn: toDate(input.checkIn), checkOut: toDate(checkOut), nightlyPrices: quote!.rooms[i].nights.map((n) => n.price), extraGuestTotal: quote!.rooms[i].extraGuestTotal } : {}),
          },
        });
      }
      if (shift) {
        await tx.booking.update({
          where: { id: b.id },
          data: { checkIn: toDate(input.checkIn), checkOut: toDate(checkOut), roomsTotal: quote!.roomsTotal + quote!.extraGuestsTotal, extrasTotal: quote!.extrasTotal, taxTotal: quote!.taxTotal, grandTotal: newTotal, priceBreakdown: { ...quote!, discountTotal: b.discountTotal, grandTotal: newTotal } as unknown as Prisma.InputJsonValue },
        });
      }
      return plan;
    }, TX);
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("room_busy");
    throw e;
  }
}

async function quoteUnrestricted(tx: Tx, cart: CartInput) {
  const settings = await loadSettings(tx);
  const ctx = await loadRateContext(cart.checkIn, cart.checkOut, tx);
  return {
    quote: buildQuote({
      checkIn: cart.checkIn, checkOut: cart.checkOut,
      rooms: cart.lines.map((l) => ({ roomType: ctx.types.find((t) => t.id === l.roomTypeId)!, adults: l.adults, childAges: l.childAges })),
      seasons: ctx.seasons, overrides: ctx.overrides, occupancyRules: ctx.rules,
      extras: cart.extras.map((e) => ({ extra: ctx.extras.find((x) => x.id === e.extraId)!, quantity: e.quantity })).filter((e) => e.extra),
      promo: null, bookingDate: nowInGeorgia().date, cityTaxPerPersonNight: settings.booking.cityTaxPerPersonNight, cityTaxChildren: settings.booking.cityTaxChildren,
    }),
  };
}

export async function recordManualPayment(bookingId: string, amount: number, method: string) {
  return db.$transaction(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await tx.payment.create({ data: { bookingId, provider: method, status: "succeeded", amount, providerRef: `manual-${Date.now()}` } });
    const amountPaid = b.amountPaid + amount;
    return tx.booking.update({ where: { id: bookingId }, data: { amountPaid, paymentStatus: amountPaid >= b.grandTotal ? "PAID" : amountPaid > 0 ? "DEPOSIT_PAID" : "UNPAID" } });
  });
}

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
};
export const allowedTransitions = (status: string) => TRANSITIONS[status] ?? [];

export async function changeStatus(bookingId: string, to: "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW") {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (!allowedTransitions(b.status).includes(to)) throw new BookingError("bad_transition");
    const code = to === "CONFIRMED" && b.code.startsWith("HOLD-") ? await nextBookingCode(tx, new Date().getFullYear()) : b.code;
    if (to === "CONFIRMED") await tx.roomAllocation.updateMany({ where: { bookingId }, data: { kind: "BOOKING", holdExpiresAt: null } });
    let penalty = b.penaltyAmount;
    if (to === "NO_SHOW") {
      await tx.roomAllocation.updateMany({ where: { bookingId }, data: { active: false } });
      const s = await loadSettings(tx);
      const allocs = await tx.roomAllocation.findMany({ where: { bookingId } });
      penalty = penaltyAmount(s.booking.noShowPenalty, { grandTotal: b.grandTotal, firstNights: allocs.map((a) => a.nightlyPrices[0] ?? 0), percent: s.booking.noShowPercent });
    }
    if (to === "CHECKED_IN") {
      // the room is now occupied → mark for housekeeping on departure
    }
    if (to === "CHECKED_OUT") {
      const rooms = await tx.roomAllocation.findMany({ where: { bookingId }, select: { roomId: true } });
      await tx.room.updateMany({ where: { id: { in: rooms.map((r) => r.roomId) } }, data: { housekeeping: "DIRTY" } });
    }
    return tx.booking.update({ where: { id: bookingId }, data: { status: to, code, penaltyAmount: penalty, holdExpiresAt: to === "CONFIRMED" ? null : b.holdExpiresAt, confirmedAt: to === "CONFIRMED" ? new Date() : b.confirmedAt } });
  }, TX);
}

// ───────────────────────────── Activity log ─────────────────────────────

export async function logActivity(entry: { userId?: string | null; action: string; entity: string; entityId?: string | null; summary?: string; before?: unknown; after?: unknown; ip?: string | null }) {
  await db.activityLog.create({
    data: {
      userId: entry.userId ?? null, action: entry.action, entity: entry.entity, entityId: entry.entityId ?? null, summary: entry.summary,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue, after: (entry.after ?? undefined) as Prisma.InputJsonValue, ip: entry.ip ?? null,
    },
  });
}
