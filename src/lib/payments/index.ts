import "server-only";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { confirmPaidBooking, loadSettings, recordFailedPayment } from "@/lib/booking/service";
import { notifyBookingConfirmed } from "@/lib/notify/booking-mail";
import { bogProvider } from "./bog";
import { mockProvider } from "./mock";
import { tbcProvider } from "./tbc";
import type { PaymentProvider, PaymentStatus } from "./types";

const PROVIDERS: Record<string, PaymentProvider> = { mock: mockProvider, tbc: tbcProvider, bog: bogProvider };
export const getProvider = (id: string) => PROVIDERS[id] ?? null;

/** The provider chosen in Settings → Payments, if it is configured. */
export async function activeProvider() {
  const settings = await loadSettings();
  const p = getProvider(settings.booking.paymentProvider);
  return p && p.configured() ? p : null;
}

/** Start an online payment for a pending booking and return the URL to send the guest to. */
export async function startPayment(bookingId: string, amount: number, locale: string, holdMinutes: number) {
  const provider = await activeProvider();
  if (!provider) throw new Error("payment_provider_not_configured");
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const row = await db.payment.create({ data: { bookingId, provider: provider.id, status: "created", amount, currency: "GEL" } });
  const prefix = locale === "ka" ? "" : `/${locale}`;
  const created = await provider.createPayment({
    paymentId: row.id, bookingId, amount, locale, ttlMinutes: holdMinutes,
    description: `Royal Palace ${booking.checkIn.toISOString().slice(0, 10)}`,
    returnUrl: `${SITE_URL}${prefix}/booking/return?p=${row.id}`,
    callbackUrl: `${SITE_URL}/api/payments/${provider.id}/callback`,
  });
  await db.payment.update({ where: { id: row.id }, data: { providerRef: created.providerRef, status: "pending", raw: (created.raw ?? undefined) as never } });
  return { redirectUrl: created.redirectUrl, paymentId: row.id };
}

/**
 * Ask the provider for the real status of a payment and apply it (confirm booking + notify, or record failure).
 * Safe to call repeatedly — from the callback, from the return page, and from the maintenance job.
 */
export async function syncPayment(paymentId: string): Promise<PaymentStatus> {
  const row = await db.payment.findUnique({ where: { id: paymentId } });
  if (!row?.providerRef) return "pending";
  if (row.status === "succeeded") return "succeeded";
  const provider = getProvider(row.provider);
  if (!provider) return "pending";
  const s = await provider.fetchStatus(row.providerRef);
  if (s.status === "succeeded") {
    const res = await confirmPaidBooking(row.bookingId, { provider: row.provider, providerRef: row.providerRef, amount: s.amount ?? row.amount, raw: s.raw });
    if (!res.alreadyProcessed && !res.conflict) await notifyBookingConfirmed(row.bookingId);
  } else if (s.status === "failed" || s.status === "cancelled") {
    await recordFailedPayment(row.bookingId, { provider: row.provider, providerRef: row.providerRef, amount: row.amount, status: s.status, raw: s.raw });
  }
  return s.status;
}

export async function syncPaymentByRef(providerId: string, providerRef: string) {
  const row = await db.payment.findFirst({ where: { provider: providerId, providerRef } });
  return row ? syncPayment(row.id) : "pending";
}

/** Refund through the provider that took the money (manual methods are refunded by staff in person). */
export async function refundBookingPayments(bookingId: string, amount: number) {
  if (amount <= 0) return { refunded: 0 };
  const pays = await db.payment.findMany({ where: { bookingId, status: "succeeded" }, orderBy: { createdAt: "desc" } });
  let left = amount;
  for (const p of pays) {
    const provider = getProvider(p.provider);
    if (!provider || !p.providerRef || left <= 0) continue;
    const part = Math.min(left, p.amount);
    const r = await provider.refund(p.providerRef, part).catch((e) => ({ ok: false, raw: String(e) }));
    if (r.ok) {
      await db.payment.create({ data: { bookingId, provider: p.provider, status: "refunded", amount: -part, providerRef: `${p.providerRef}:refund:${Date.now()}`, raw: (r.raw ?? undefined) as never } });
      left -= part;
    }
  }
  const refunded = amount - left;
  if (refunded > 0) {
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await db.booking.update({ where: { id: bookingId }, data: { amountPaid: Math.max(0, b.amountPaid - refunded), paymentStatus: refunded >= b.amountPaid ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
  }
  return { refunded, outstanding: left };
}
