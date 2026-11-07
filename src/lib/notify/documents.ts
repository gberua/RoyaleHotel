import "server-only";
import type { PDFPage } from "pdf-lib";
import { translator } from "./translator";
import { draw, footer, header, newPdf, textWidth, wrap, A4, LINE, MUTED, SEA, type Fonts } from "./pdf";
import type { FullBooking } from "@/lib/booking/load";
import { nightsBetween } from "@/lib/booking/dates";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";
import type { Settings } from "@/lib/settings-schema";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Guest registration card, printed at check-in and signed by the guest (booking language or ?lang=). */
export async function renderRegistrationCard(b: FullBooking, settings: Settings, messages: Record<string, unknown>, locale: string) {
  const t = translator(locale, messages, "docs");
  const { doc, fonts } = await newPdf(`${t("regTitle")} ${b.code}`);
  const page = doc.addPage(A4);
  const W = page.getWidth();
  header(page, fonts, t("regTitle"));
  let y = 722;
  draw(page, fonts, `${t("booking")} ${b.code}`, 48, y, 13, true, SEA);
  draw(page, fonts, `${iso(b.checkIn)} → ${iso(b.checkOut)} · ${t("nights", { n: nightsBetween(iso(b.checkIn), iso(b.checkOut)) })}`, 48, y - 18, 10, false, MUTED);
  y -= 44;
  const rooms = b.rooms.filter((r) => r.active);
  const field = (label: string, value: string | null | undefined, x = 48, w = W - 96) => {
    draw(page, fonts, label, x, y, 8, true, MUTED);
    if (value) draw(page, fonts, value, x, y - 15, 11);
    page.drawLine({ start: { x, y: y - 19 }, end: { x: x + w, y: y - 19 }, thickness: 0.6, color: LINE });
  };
  const half = (W - 96 - 16) / 2;
  const pair = (l1: string, v1: string | null | undefined, l2: string, v2: string | null | undefined) => { field(l1, v1, 48, half); field(l2, v2, 48 + half + 16, half); y -= 38; };
  pair(t("lastName"), b.guest?.lastName, t("firstName"), b.guest?.firstName);
  pair(t("nationality"), b.guest?.country, t("birthDate"), null);
  pair(t("docType"), null, t("docNumber"), null);
  field(t("homeAddress"), null); y -= 38;
  pair(t("phone"), b.guest?.phone, t("email"), b.guest?.email?.endsWith("@guests.royalehotel.local") ? null : b.guest?.email);
  pair(t("rooms"), rooms.map((r) => r.room.number).join(", "), t("guestsCount"), `${b.adults} + ${b.children}`);
  pair(t("arrival"), `${iso(b.checkIn)} · ${t("from", { time: settings.hotel.checkInFrom })}`, t("departure"), `${iso(b.checkOut)} · ${t("until", { time: settings.hotel.checkOutUntil })}`);
  draw(page, fonts, t("otherGuests"), 48, y, 8, true, MUTED);
  y -= 6;
  for (let i = 0; i < Math.max(2, b.adults + b.children - 1); i++) { y -= 22; page.drawLine({ start: { x: 48, y }, end: { x: W - 48, y }, thickness: 0.6, color: LINE }); }
  y -= 28;
  for (const line of wrap(fonts, t("declaration"), 9, W - 96)) { draw(page, fonts, line, 48, y, 9, false, MUTED); y -= 13; }
  y -= 34;
  page.drawLine({ start: { x: 48, y }, end: { x: 260, y }, thickness: 0.8, color: MUTED });
  page.drawLine({ start: { x: W - 220, y }, end: { x: W - 48, y }, thickness: 0.8, color: MUTED });
  draw(page, fonts, t("signature"), 48, y - 13, 8, false, MUTED);
  draw(page, fonts, t("date"), W - 220, y - 13, 8, false, MUTED);
  footer(page, fonts, settings, locale);
  return Buffer.from(await doc.save());
}

/** Invoice / folio: rooms per night, extra guests, extras, discount, city tax, payments, balance. */
export async function renderInvoice(b: FullBooking, settings: Settings, messages: Record<string, unknown>, locale: string) {
  const t = translator(locale, messages, "docs");
  const { doc, fonts } = await newPdf(`${t("invoiceTitle")} ${b.code}`);
  let page = doc.addPage(A4);
  const W = page.getWidth();
  const money = (n: number) => formatMoney(n, undefined, locale, 2);
  header(page, fonts, t("invoiceTitle"));
  let y = 722;
  draw(page, fonts, `${t("invoiceNo")} INV-${b.code.replace(/^RH-/, "")}`, 48, y, 13, true, SEA);
  draw(page, fonts, `${t("issued")}: ${new Date().toISOString().slice(0, 10)} · ${t("booking")} ${b.code}`, 48, y - 18, 10, false, MUTED);
  draw(page, fonts, t("billTo"), W - 260, y, 8, true, MUTED);
  if (b.guest) {
    draw(page, fonts, `${b.guest.firstName} ${b.guest.lastName}`, W - 260, y - 15, 11, true);
    const contact = [b.guest.email?.endsWith("@guests.royalehotel.local") ? "" : b.guest.email, b.guest.phone].filter((x): x is string => !!x);
    contact.forEach((c, i) => draw(page, fonts, c, W - 260, y - 30 - i * 12, 9, false, MUTED));
  }
  y -= 64;
  const amountX = W - 48;
  const right = (pg: PDFPage, f: Fonts, text: string, yy: number, size: number, bold = false) => draw(pg, f, text, amountX - textWidth(f, text, size, bold), yy, size, bold);
  const row = (label: string, amount: number | null, opts: { bold?: boolean; sub?: string; color?: typeof SEA } = {}) => {
    if (y < 110) { footer(page, fonts, settings, locale); page = doc.addPage(A4); header(page, fonts, t("invoiceTitle")); y = 722; }
    draw(page, fonts, label, 48, y, 10, !!opts.bold, opts.color);
    if (opts.sub) draw(page, fonts, opts.sub, 48, y - 13, 8, false, MUTED);
    if (amount != null) right(page, fonts, money(amount), y, 10, !!opts.bold);
    y -= opts.sub ? 30 : 20;
  };
  page.drawLine({ start: { x: 48, y: y + 14 }, end: { x: W - 48, y: y + 14 }, thickness: 0.6, color: LINE });
  const nights = nightsBetween(iso(b.checkIn), iso(b.checkOut));
  for (const r of b.rooms.filter((x) => x.active || b.status === "CANCELLED")) {
    const total = r.nightlyPrices.reduce((s, p) => s + p, 0);
    row(`${tr(r.room.roomType.name, locale)} · ${t("room")} ${r.room.number}`, total, { sub: `${iso(b.checkIn)} → ${iso(b.checkOut)} · ${t("nights", { n: nights })} · ${r.nightlyPrices.map((p) => (p / 100).toFixed(0)).join(" / ")} ₾` });
    if (r.extraGuestTotal) row(`  ${t("extraGuests")} (${r.adults}+${r.children})`, r.extraGuestTotal);
  }
  for (const e of b.extras) row(`${tr(e.extra.name, locale)} ×${e.quantity}`, e.total);
  if (b.discountTotal > 0) row(`${t("discount")}${b.promoCode ? ` (${b.promoCode.code})` : ""}`, -b.discountTotal, { color: SEA });
  if (b.taxTotal > 0) row(t("cityTax"), b.taxTotal);
  if (b.penaltyAmount && ["CANCELLED", "NO_SHOW"].includes(b.status)) row(t("penalty"), b.penaltyAmount);
  page.drawLine({ start: { x: 48, y: y + 12 }, end: { x: W - 48, y: y + 12 }, thickness: 0.8, color: MUTED });
  const due = ["CANCELLED", "NO_SHOW"].includes(b.status) ? b.penaltyAmount : b.grandTotal;
  row(t("total"), due, { bold: true });
  if (settings.booking.vatIncluded) { draw(page, fonts, t("vatIncluded"), 48, y + 6, 8, false, MUTED); y -= 10; }
  y -= 8;
  draw(page, fonts, t("payments"), 48, y, 8, true, MUTED); y -= 18;
  const paid = b.payments.filter((p) => p.status === "succeeded");
  if (!paid.length) row(t("noPayments"), null);
  for (const p of paid) row(`${p.createdAt.toISOString().slice(0, 10)} · ${t.has(`method.${p.provider}`) ? t(`method.${p.provider}`) : p.provider}`, p.amount);
  const refunds = b.payments.filter((p) => p.status === "refunded");
  for (const p of refunds) row(`${p.createdAt.toISOString().slice(0, 10)} · ${t("refund")}`, -p.amount);
  page.drawLine({ start: { x: 48, y: y + 12 }, end: { x: W - 48, y: y + 12 }, thickness: 0.8, color: MUTED });
  row(t("balance"), Math.max(0, due - b.amountPaid), { bold: true });
  footer(page, fonts, settings, locale);
  return Buffer.from(await doc.save());
}
