import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { tr } from "@/lib/i18n-content";
import type { Settings } from "@/lib/settings-schema";

/** Shared PDF building blocks (voucher, registration card, invoice): Georgian + Latin/Cyrillic fonts, header, footer. */
const FONT_DIR = join(process.cwd(), "src", "fonts", "pdf");
const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;
export const INK = rgb(0.043, 0.18, 0.227);
export const SEA = rgb(0.043, 0.49, 0.533);
export const MUTED = rgb(0.29, 0.42, 0.46);
export const LINE = rgb(0.87, 0.91, 0.92);
export const A4: [number, number] = [595.28, 841.89];

export type Fonts = { ka: PDFFont; kaBold: PDFFont; latin: PDFFont; latinBold: PDFFont };

export async function newPdf(title: string) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const load = async (f: string) => doc.embedFont(await readFile(join(FONT_DIR, f)), { subset: true });
  const fonts: Fonts = { ka: await load("ka-400.ttf"), kaBold: await load("ka-700.ttf"), latin: await load("latin-400.ttf"), latinBold: await load("latin-700.ttf") };
  doc.setTitle(title);
  return { doc, fonts };
}

/** Characters the embedded fonts don't have → close equivalents (narrow / no-break spaces from number formatting, arrows). */
const clean = (s: string) => s.replace(/[\u202F\u00A0\u2009]/g, " ").replace(/→/g, "–");

/** Draw text that may mix Georgian and Latin/Cyrillic: split into runs and pick a font per run. Returns the end x. */
export function draw(page: PDFPage, fonts: Fonts, raw: string, x: number, y: number, size: number, bold = false, color = INK) {
  const text = clean(raw);
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

export function textWidth(fonts: Fonts, text: string, size: number, bold = false) {
  let w = 0;
  for (const ch of clean(text)) w += (GEORGIAN.test(ch) ? (bold ? fonts.kaBold : fonts.ka) : bold ? fonts.latinBold : fonts.latin).widthOfTextAtSize(ch, size);
  return w;
}

/** Simple word wrap for paragraphs. */
export function wrap(fonts: Fonts, text: string, size: number, maxWidth: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(fonts, next, size) > maxWidth && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function header(page: PDFPage, fonts: Fonts, title: string) {
  const W = page.getWidth();
  page.drawRectangle({ x: 0, y: 760, width: W, height: 82, color: INK });
  draw(page, fonts, "ROYALE", 48, 800, 26, false, rgb(1, 1, 1));
  draw(page, fonts, "HOTEL · KOBULETI · GEORGIA", 48, 782, 8, true, rgb(0.64, 0.91, 0.93));
  draw(page, fonts, title, W - 48 - textWidth(fonts, title, 12, true), 796, 12, true, rgb(1, 1, 1));
}

export function footer(page: PDFPage, fonts: Fonts, settings: Settings, locale: string) {
  const W = page.getWidth();
  page.drawRectangle({ x: 0, y: 0, width: W, height: 70, color: rgb(0.95, 0.97, 0.97) });
  const name = settings.hotel.legalName || tr(settings.hotel.name, locale) || "Royale Hotel";
  draw(page, fonts, `${name} · ${tr(settings.hotel.address, locale)}`, 48, 42, 9, false, MUTED);
  draw(page, fonts, `${settings.contact.phone}  ·  ${settings.contact.email}`, 48, 26, 9, false, MUTED);
}
