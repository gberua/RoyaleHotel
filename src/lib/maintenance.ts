import "server-only";
import { db } from "@/lib/db";
import { releaseExpired } from "@/lib/booking/service";
import { syncPayment } from "@/lib/payments";
import { syncAllIcalFeeds } from "@/lib/ical/sync";
import { settingsSchema } from "@/lib/settings-schema";
import { updateRatesFromNbg } from "@/lib/currency/nbg";
import { sendAutomaticEmails } from "@/lib/notify/automatic";

/**
 * Periodic job (every 15 minutes): releases expired holds / unpaid bookings, re-checks payments whose
 * callback never arrived, syncs iCal feeds from Booking.com / Airbnb and (if switched on) refreshes
 * exchange rates from the National Bank of Georgia once a day, and sends the automatic guest e-mails
 * (pre-arrival reminder, review request).
 */
export async function runMaintenance() {
  const started = Date.now();
  // payments still pending for > 2 minutes: ask the provider directly before expiring anything
  const stale = await db.payment.findMany({ where: { status: "pending", createdAt: { lt: new Date(Date.now() - 120_000) }, provider: { in: ["tbc", "bog"] } }, select: { id: true }, take: 50 });
  for (const p of stale) await syncPayment(p.id).catch((e) => console.error("[maintenance] payment sync", e));
  const released = await releaseExpired();
  const ical = await syncAllIcalFeeds().catch((e) => ({ error: String(e) }));
  const rates = await dailyRates().catch((e) => ({ error: String(e) }));
  const emails = await sendAutomaticEmails().catch((e) => ({ error: String(e) }));
  return { released, paymentsChecked: stale.length, ical, rates, emails, ms: Date.now() - started };
}

async function dailyRates() {
  const row = await db.setting.findUnique({ where: { key: "currency" } });
  const c = settingsSchema.shape.currency.parse(row?.value ?? {});
  if (!c.autoUpdate) return "off";
  if (c.lastUpdatedAt && Date.now() - Date.parse(c.lastUpdatedAt) < 20 * 3600_000) return "fresh";
  await updateRatesFromNbg(null);
  return "updated";
}
