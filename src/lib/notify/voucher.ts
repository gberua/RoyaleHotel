import "server-only";
import { translator } from "./translator";
import { draw, header, footer, newPdf, A4, LINE, MUTED, SEA } from "./pdf";
import type { FullBooking } from "@/lib/booking/load";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";
import type { Settings } from "@/lib/settings-schema";

export async function renderVoucher(b: FullBooking, settings: Settings, messages: Record<string, unknown>) {
  const locale = b.locale;
  const t = translator(locale, messages, "email");
  const ts = translator(locale, messages, "bookingStatus");
  const { doc, fonts } = await newPdf(`${b.code} — Royale Hotel`);
  const page = doc.addPage(A4);
  const W = page.getWidth();
  const money = (n: number) => formatMoney(n, undefined, locale);

  header(page, fonts, t("voucherTitle"));

  let y = 720;
  draw(page, fonts, t("code"), 48, y, 10, false, MUTED);
  draw(page, fonts, b.code, 48, y - 26, 24, true, SEA);
  draw(page, fonts, ts(b.status), W - 200, y - 22, 12, true);
  y -= 64;
  page.drawLine({ start: { x: 48, y }, end: { x: W - 48, y }, thickness: 0.6, color: LINE });
  y -= 26;

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const row = (label: string, value: string) => {
    draw(page, fonts, label, 48, y, 10, false, MUTED);
    const lines = value.split("\n");
    for (const [i, l] of lines.entries()) draw(page, fonts, l, 210, y - i * 15, 11, i === 0);
    y -= 15 * lines.length + 10;
  };
  if (b.guest) row(t("guests"), `${b.guest.firstName} ${b.guest.lastName}\n${b.guest.email} · ${b.guest.phone ?? ""}`);
  row(t("checkIn"), `${iso(b.checkIn)}  ·  ${t("from", { time: settings.hotel.checkInFrom })}`);
  row(t("checkOut"), `${iso(b.checkOut)}  ·  ${t("until", { time: settings.hotel.checkOutUntil })}`);
  row(t("rooms"), b.rooms.filter((r) => r.active || b.status === "CANCELLED").map((r) => `${tr(r.room.roomType.name, locale)} — ${r.adults}+${r.children}`).join("\n") || "—");
  if (b.extras.length) row(t("extras"), b.extras.map((e) => `${tr(e.extra.name, locale)} ×${e.quantity} — ${money(e.total)}`).join("\n"));
  y -= 6;
  page.drawLine({ start: { x: 48, y: y + 8 }, end: { x: W - 48, y: y + 8 }, thickness: 0.6, color: LINE });
  y -= 14;
  row(t("total"), money(b.grandTotal));
  row(t("paid"), money(b.amountPaid));
  if (b.status !== "CANCELLED") row(t("balance"), money(Math.max(0, b.grandTotal - b.amountPaid)));

  const terms = b.cancellationPolicy as { freeCancellationDays?: number } | null;
  if (terms?.freeCancellationDays != null && b.status !== "CANCELLED") {
    const d = new Date(b.checkIn.getTime() - terms.freeCancellationDays * 86_400_000).toISOString().slice(0, 10);
    y -= 6;
    draw(page, fonts, t("freeCancel", { date: d }), 48, y, 10, false, SEA);
    y -= 18;
  }

  footer(page, fonts, settings, locale);
  return Buffer.from(await doc.save());
}
