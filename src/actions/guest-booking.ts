"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { bookingAccess, grantBookingAccess, revokeBookingAccess } from "@/lib/booking/guest-session";
import { cancelBooking, cancellationPreview, loadSettings, logActivity } from "@/lib/booking/service";
import { notifyBookingCancelled } from "@/lib/notify/booking-mail";
import { refundBookingPayments, startPayment, syncPayment } from "@/lib/payments";
import { mockProvider } from "@/lib/payments/mock";

const path = (href: string, locale: string) => getPathname({ href, locale: isLocale(locale) ? locale : "ka" });

/** Mock provider only: the tester picks the outcome; we then run the normal verification path. */
export async function completeMockPayment(form: FormData) {
  if (!mockProvider.configured()) throw new Error("Mock payments are disabled");
  const ref = String(form.get("ref") ?? "");
  const outcome = String(form.get("outcome") ?? "");
  const locale = String(form.get("locale") ?? "ka");
  if (!["success", "fail", "cancel"].includes(outcome)) throw new Error("bad outcome");
  const p = await db.payment.findFirst({ where: { providerRef: ref, provider: "mock" } });
  if (!p) redirect(path("/", locale));
  if (p.status === "pending" || p.status === "created") await db.payment.update({ where: { id: p.id }, data: { raw: { outcome } } });
  await syncPayment(p.id);
  redirect(`${path("/booking/return", locale)}?p=${p.id}`);
}

/** Try the online payment again for a still-pending booking (e.g. after a declined card). */
export async function retryPayment(form: FormData) {
  const bookingId = String(form.get("booking") ?? "");
  const locale = String(form.get("locale") ?? "ka");
  if ((await bookingAccess()) !== bookingId) redirect(path("/booking/manage", locale));
  const [b, settings] = await Promise.all([db.booking.findUnique({ where: { id: bookingId } }), loadSettings()]);
  if (!b || b.status !== "PENDING" || !b.holdExpiresAt || b.holdExpiresAt < new Date()) redirect(`${path("/book", locale)}`);
  const pay = await startPayment(b.id, b.depositDue || b.grandTotal, locale, Math.max(1, Math.round((b.holdExpiresAt.getTime() - Date.now()) / 60_000)) || settings.booking.holdMinutes);
  redirect(pay.redirectUrl);
}

export async function lookupBooking(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const p = z.object({ code: z.string().trim().toUpperCase().regex(/^RH-\d{4}-\d{4,6}$/), email: z.email().max(200), locale: z.string().max(5) })
    .safeParse({ code: form.get("code"), email: String(form.get("email") ?? "").trim().toLowerCase(), locale: form.get("locale") });
  if (!(await rateLimit("manage-lookup", 10, 900))) return { error: "rate_limited" };
  if (!p.success) return { error: "not_found" };
  const b = await db.booking.findUnique({ where: { code: p.data.code }, include: { guest: { select: { email: true } } } });
  if (!b || b.guest?.email !== p.data.email) return { error: "not_found" }; // same answer either way (no enumeration)
  await grantBookingAccess(b.id, 2);
  redirect(path("/booking/manage", p.data.locale));
}

export async function signOutBooking(form: FormData) {
  await revokeBookingAccess();
  redirect(path("/booking/manage", String(form.get("locale") ?? "ka")));
}

export async function guestCancelBooking(_prev: { error?: string; done?: boolean }, form: FormData): Promise<{ error?: string; done?: boolean }> {
  const id = await bookingAccess();
  if (!id || form.get("booking") !== id) return { error: "not_found" };
  if (!(await rateLimit("manage-cancel", 5, 900))) return { error: "rate_limited" };
  const b = await db.booking.findUnique({ where: { id } });
  if (!b || !["PENDING", "CONFIRMED"].includes(b.status)) return { error: "not_cancellable" };
  const preview = await cancellationPreview(id);
  // The guest confirmed the amounts shown on screen; refuse if they changed meanwhile (e.g. the deadline passed)
  if (String(preview.refund) !== String(form.get("refund"))) return { error: "changed" };
  await cancelBooking(id, "Cancelled by guest online");
  const ip = await clientIp();
  after(async () => {
    const r = await refundBookingPayments(id, preview.refund);
    await logActivity({ action: "booking.cancel", entity: "Booking", entityId: id, summary: `Guest cancelled ${b.code} online; refund ${preview.refund} (refunded ${r.refunded}, outstanding ${("outstanding" in r ? r.outstanding : 0) ?? 0})`, ip });
    await notifyBookingCancelled(id, "guest");
  });
  return { done: true };
}
