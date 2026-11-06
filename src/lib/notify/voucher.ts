import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { translator } from "./translator";
import type { FullBooking } from "@/lib/booking/load";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";
import type { Settings } from "@/lib/settings-schema";

const FONT_DIR = join(process.cwd(), "src", "fonts", "pdf");
const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;
const INK = rgb(0.043, 0.18, 0.227);
const SEA = rgb(0.043, 0.49, 0.533);
const MUTED = rgb(0.29, 0.42, 0.46);

type Fonts = { ka: PDFFont; kaBold: PDFFont; latin: PDFFont; latinBold: PDFFont };

/** Draw text that may mix Georgian and Latin/Cyrillic: split into runs and pick a font per run. */
function draw(page: PDFPage, fonts: Fonts, text: string, x: number, y: number, size: number, bold = false, color = INK) {
  const runs: { t: string; ka: boolean }[] = [];
  for (const ch of text) {
    const ka = GEORGIAN.test(ch);
    const last = runs.at(-1);
    if (last && (last.ka === ka || ch === " ")) last.t += ch;
    else runs.push({ t: ch, ka });
  }
  let cx = x;
  for (const r of runs) {
    const font = r.ka ? (bold ? fonts.kaBold : fonts.ka) : bold ? fonts.latinBold : fonts.latin;
    page.drawText(r.t, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(r.t, size);
  }
  return cx;
}

export async function renderVoucher(b: FullBooking, settings: Settings, messages: Record<string, unknown>) {
  const locale = b.locale;
  const t = translator(locale, messages, "email");
  const ts = translator(locale, messages, "bookingStatus");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const load = async (f: string) => doc.embedFont(await readFile(join(FONT_DIR, f)), { subset: true });
  const fonts: Fonts = { ka: await load("ka-400.ttf"), kaBold: await load("ka-700.ttf"), latin: await load("latin-400.ttf"), latinBold: await load("latin-700.ttf") };
  doc.setTitle(`${b.code} — Royale Hotel`);
  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const money = (n: number) => formatMoney(n, undefined, locale);

  page.drawRectangle({ x: 0, y: 760, width: W, height: 82, color: INK });
  draw(page, fonts, "ROYALE", 48, 800, 26, false, rgb(1, 1, 1));
  draw(page, fonts, "HOTEL · KOBULETI · GEORGIA", 48, 782, 8, true, rgb(0.64, 0.91, 0.93));
  draw(page, fonts, t("voucherTitle"), W - 48 - fonts.ka.widthOfTextAtSize(t("voucherTitle"), 12) - 10, 796, 12, true, rgb(1, 1, 1));

  let y = 720;
  draw(page, fonts, t("code"), 48, y, 10, false, MUTED);
  draw(page, fonts, b.code, 48, y - 26, 24, true, SEA);
  draw(page, fonts, ts(b.status), W - 200, y - 22, 12, true);
  y -= 64;
  page.drawLine({ start: { x: 48, y }, end: { x: W - 48, y }, thickness: 0.6, color: rgb(0.87, 0.91, 0.92) });
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
  page.drawLine({ start: { x: 48, y: y + 8 }, end: { x: W - 48, y: y + 8 }, thickness: 0.6, color: rgb(0.87, 0.91, 0.92) });
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

  page.drawRectangle({ x: 0, y: 0, width: W, height: 70, color: rgb(0.95, 0.97, 0.97) });
  draw(page, fonts, tr(settings.hotel.address, locale), 48, 42, 9, false, MUTED);
  draw(page, fonts, `${settings.contact.phone}  ·  ${settings.contact.email}`, 48, 26, 9, false, MUTED);
  return Buffer.from(await doc.save());
}
