import "server-only";
import { db } from "@/lib/db";
import { addDaysIso, todayInGeorgia, toDate } from "@/lib/booking/dates";
import { loadSettings } from "@/lib/booking/service";
import { sendMail } from "./email";
import { fill, loadTemplate, templateHtml, templateVars, type TemplateKey } from "./templates";

const NO_EMAIL = "@guests.royalehotel.local"; // walk-ins / phone bookings without an e-mail address

/**
 * Daily job (Admin → E-mails & messages switches it on/off):
 *  • pre-arrival reminder X days before check-in (confirmed bookings made more than a day ago)
 *  • review request Y days after check-out (checked-out stays of the last week)
 * Each booking gets each e-mail at most once (reminderSentAt / reviewRequestSentAt).
 */
export async function sendAutomaticEmails(today = todayInGeorgia(), now = new Date()) {
  const settings = await loadSettings();
  const a = settings.automation;
  const result = { reminders: 0, reviews: 0, failed: 0 };

  const send = async (key: TemplateKey, b: Awaited<ReturnType<typeof loadCandidates>>[number], field: "reminderSentAt" | "reviewRequestSentAt") => {
    if (!b.guest?.email || b.guest.email.endsWith(NO_EMAIL)) return false;
    // claim the booking first, so two job runs at the same time can't both send
    const claimed = await db.booking.updateMany({ where: { id: b.id, [field]: null }, data: { [field]: now } });
    if (!claimed.count) return false;
    const tpl = await loadTemplate(key, b.locale);
    const vars = templateVars(b, settings);
    const res = await sendMail({ to: b.guest.email, subject: fill(tpl.subject, vars), html: templateHtml(fill(tpl.body, vars), settings, b.locale), text: fill(tpl.body, vars), replyTo: settings.contact.bookingEmail }).catch(() => ({ ok: false }));
    if (!res.ok) {
      await db.booking.update({ where: { id: b.id }, data: { [field]: null } }); // try again next run
      result.failed++;
      return false;
    }
    await db.activityLog.create({ data: { action: `email.${key}`, entity: "Booking", entityId: b.id, summary: `${b.code}: ${key === "pre_arrival" ? "pre-arrival reminder" : "review request"} sent to ${b.guest.email}` } });
    return true;
  };

  if (a.preArrivalEnabled) {
    const until = addDaysIso(today, a.preArrivalDays);
    const list = await loadCandidates({ status: "CONFIRMED", reminderSentAt: null, checkIn: { gt: toDate(today), lte: toDate(until) }, createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } });
    for (const b of list) if (await send("pre_arrival", b, "reminderSentAt")) result.reminders++;
  }
  if (a.postStayEnabled) {
    const latest = addDaysIso(today, -a.postStayDays);
    const list = await loadCandidates({ status: "CHECKED_OUT", reviewRequestSentAt: null, checkOut: { lte: toDate(latest), gte: toDate(addDaysIso(latest, -7)) } });
    for (const b of list) if (await send("post_stay", b, "reviewRequestSentAt")) result.reviews++;
  }
  return result;
}

function loadCandidates(where: NonNullable<Parameters<typeof db.booking.findMany>[0]>["where"]) {
  return db.booking.findMany({ where, take: 200, select: { id: true, code: true, checkIn: true, checkOut: true, locale: true, guest: { select: { firstName: true, email: true } } } });
}

/** For the admin screen: automatic e-mails sent in the last 7 days, and confirmed future stays still waiting for their reminder. */
export async function automaticEmailStats(now = new Date()) {
  const [sent7, upcoming] = await Promise.all([
    db.activityLog.count({ where: { action: { in: ["email.pre_arrival", "email.post_stay"] }, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } }),
    db.booking.count({ where: { status: "CONFIRMED", reminderSentAt: null, checkIn: { gt: now } } }),
  ]);
  return { sent7, upcoming };
}
