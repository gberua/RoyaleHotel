import "server-only";
import { translator, type T } from "./translator";
import { loadBooking, type FullBooking } from "@/lib/booking/load";
import { loadSettings } from "@/lib/booking/service";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";
import { SITE_URL } from "@/lib/site-url";
import { isLocale } from "@/i18n/locales";
import { sendMail } from "./email";
import { sendTelegram } from "./telegram";
import { renderVoucher } from "./voucher";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export async function messagesFor(locale: string) {
  const l = isLocale(locale) ? locale : "ka";
  return { locale: l, messages: (await import(`../../../messages/${l}.json`)).default as Record<string, unknown> };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

function managePath(locale: string) {
  return `${SITE_URL}${locale === "ka" ? "" : `/${locale}`}/booking/manage`;
}

function emailHtml(b: FullBooking, kind: "confirmed" | "cancelled", t: T, settings: Awaited<ReturnType<typeof loadSettings>>, locale: string) {
  const money = (n: number) => formatMoney(n, undefined, locale);
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#4b6b75;width:42%">${esc(k)}</td><td style="padding:6px 0;color:#0b2e3a;font-weight:600">${v}</td></tr>`;
  const rooms = b.rooms.map((r) => esc(`${tr(r.room.roomType.name, locale)} (${r.adults}+${r.children})`)).join("<br>");
  const freeDays = (b.cancellationPolicy as { freeCancellationDays?: number } | null)?.freeCancellationDays;
  const freeUntil = freeDays != null ? iso(new Date(b.checkIn.getTime() - freeDays * 86_400_000)) : null;
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f3f8f7;font-family:'Noto Sans Georgian','Noto Sans',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td align="left" style="background:#0b2e3a;padding:24px 28px;text-align:left"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="text-align:center;padding:0;color:#fff;font-family:Georgia,serif;font-size:26px;letter-spacing:4px">ROYAL PALACE</td></tr><tr><td align="center" style="text-align:center;padding:4px 0 0;font-family:Arial,sans-serif;font-size:10px;letter-spacing:4px;color:#a3e8ee">HOTEL · KOBULETI</td></tr></table></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;color:#0b2e3a">${esc(t("hello", { name: b.guest?.firstName ?? "" }))}</p>
<p style="margin:0 0 20px;color:#1d4652;line-height:1.6">${esc(kind === "confirmed" ? t("confirmedIntro") : t("cancelledIntro"))}</p>
<div style="background:#ecfbfc;border-radius:12px;padding:14px 18px;margin-bottom:20px"><div style="font-size:12px;color:#4b6b75">${esc(t("code"))}</div><div style="font-size:26px;font-weight:700;color:#0b7d88;letter-spacing:1px">${esc(b.code)}</div></div>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${row(t("checkIn"), `${iso(b.checkIn)} · ${esc(t("from", { time: settings.hotel.checkInFrom }))}`)}
${row(t("checkOut"), `${iso(b.checkOut)} · ${esc(t("until", { time: settings.hotel.checkOutUntil }))}`)}
${row(t("rooms"), rooms)}
${b.extras.length ? row(t("extras"), b.extras.map((e) => esc(`${tr(e.extra.name, locale)} ×${e.quantity}`)).join("<br>")) : ""}
${row(t("total"), money(b.grandTotal))}
${row(t("paid"), money(b.amountPaid))}
${kind === "confirmed" ? row(t("balance"), money(Math.max(0, b.grandTotal - b.amountPaid))) : ""}
</table>
${kind === "cancelled" && b.refundAmount > 0 ? `<p style="color:#0b7d88">${esc(t("refundLine", { amount: money(b.refundAmount) }))}</p>` : ""}
${kind === "confirmed" && freeUntil ? `<p style="color:#0b7d88;font-size:13px">${esc(t("freeCancel", { date: freeUntil }))}</p>` : ""}
${kind === "confirmed" ? `<p style="color:#4b6b75;font-size:13px">${esc(t("voucherAttached"))}</p>` : ""}
<p style="margin:24px 0"><a href="${managePath(locale)}?code=${encodeURIComponent(b.code)}" style="background:#14b8c4;color:#071f27;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;display:inline-block">${esc(t("manageLine"))}</a></p>
<p style="color:#1d4652;margin:0">${esc(t("signoff"))}<br><strong>${esc(t("team"))}</strong></p>
</td></tr>
<tr><td style="background:#f3f8f7;padding:16px 28px;font-size:12px;color:#4b6b75">${esc(tr(settings.hotel.address, locale))} · ${esc(settings.contact.phone)} · ${esc(settings.contact.email)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Guest confirmation (with PDF voucher) + hotel alert. Never throws: notifications must not break bookings. */
export async function notifyBookingConfirmed(bookingId: string, opts: { hotel?: boolean } = {}) {
  try {
    const [b, settings] = await Promise.all([loadBooking({ id: bookingId }), loadSettings()]);
    if (!b?.guest) return;
    const { locale, messages } = await messagesFor(b.locale);
    const t = translator(locale, messages, "email");
    const voucher = await renderVoucher(b, settings, messages);
    await sendMail({
      to: b.guest.email, subject: t("subjectConfirmed", { code: b.code }), html: emailHtml(b, "confirmed", t, settings, locale),
      attachments: [{ filename: `${b.code}.pdf`, content: voucher, contentType: "application/pdf" }], replyTo: settings.contact.bookingEmail,
    });
    if (opts.hotel !== false) await notifyHotel(b, "NEW BOOKING", settings);
    return true;
  } catch (e) {
    console.error("[notify] confirmation failed", e);
    return false;
  }
}

export async function notifyBookingCancelled(bookingId: string, by: "guest" | "staff") {
  try {
    const [b, settings] = await Promise.all([loadBooking({ id: bookingId }), loadSettings()]);
    if (!b?.guest) return;
    const { locale, messages } = await messagesFor(b.locale);
    const t = translator(locale, messages, "email");
    await sendMail({ to: b.guest.email, subject: t("subjectCancelled", { code: b.code }), html: emailHtml(b, "cancelled", t, settings, locale), replyTo: settings.contact.bookingEmail });
    await notifyHotel(b, by === "guest" ? "CANCELLED BY GUEST" : "CANCELLED", settings);
  } catch (e) {
    console.error("[notify] cancellation failed", e);
  }
}

async function notifyHotel(b: FullBooking, label: string, settings: Awaited<ReturnType<typeof loadSettings>>) {
  const money = (n: number) => formatMoney(n, undefined, "en");
  const lines = [
    `<b>${label}</b> · ${esc(b.code)}`,
    `${iso(b.checkIn)} → ${iso(b.checkOut)}`,
    ...b.rooms.map((r) => `${esc(tr(r.room.roomType.name, "en"))} — room ${esc(r.room.number)} (${r.adults}+${r.children})`),
    `Guest: ${esc(`${b.guest?.firstName} ${b.guest?.lastName}`)} · ${esc(b.guest?.phone ?? "")} · ${esc(b.guest?.email ?? "")}`,
    `Total ${money(b.grandTotal)} · paid ${money(b.amountPaid)} · ${esc(b.paymentPlan ?? "")} · source ${b.source}`,
    b.specialRequests ? `Requests: ${esc(b.specialRequests)}` : "",
    b.status === "CANCELLED" ? `Refund due: ${money(b.refundAmount)}` : "",
  ].filter(Boolean);
  const to = settings.notifications.adminEmails.length ? settings.notifications.adminEmails : [settings.contact.bookingEmail];
  await Promise.allSettled([
    sendMail({ to, subject: `[Royal Palace] ${label} ${b.code} — ${iso(b.checkIn)}`, html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${lines.join("<br>")}<br><br><a href="${SITE_URL}/admin/bookings/${encodeURIComponent(b.code)}">Open in admin</a></div>` }),
    sendTelegram(lines.join("\n") + `\n${SITE_URL}/admin/bookings/${encodeURIComponent(b.code)}`),
  ]);
}
