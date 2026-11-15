import "server-only";
import { db } from "@/lib/db";
import { nightsBetween } from "@/lib/booking/dates";
import { tr } from "@/lib/i18n-content";
import { SITE_URL } from "@/lib/site-url";
import type { Settings } from "@/lib/settings-schema";

/**
 * Guest message templates (editable in Admin → E-mails & messages). Plain text with {{placeholders}};
 * an empty override falls back to the built-in text below. Blank lines separate paragraphs, links become clickable.
 */
export const TEMPLATE_KEYS = ["pre_arrival", "post_stay", "whatsapp"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const PLACEHOLDERS = ["guestName", "code", "checkIn", "checkOut", "nights", "hotelName", "checkInTime", "checkOutTime", "address", "phone", "mapLink", "manageLink", "reviewLink"] as const;

type Tpl = { subject: string; body: string };
export const DEFAULT_TEMPLATES: Record<TemplateKey, Record<"ka" | "en" | "ru", Tpl>> = {
  pre_arrival: {
    ka: {
      subject: "მალე გნახავთ — {{hotelName}}, ჯავშანი {{code}}",
      body: "გამარჯობა, {{guestName}}!\n\nმოუთმენლად გელოდებით {{hotelName}}-ში. შესახლება — {{checkIn}}, {{checkInTime}}-დან; გაწერა — {{checkOut}}, {{checkOutTime}}-მდე.\n\nმისამართი: {{address}}\nრუკა: {{mapLink}}\n\nთუ ჩამოსვლის დროს იცით ან რამე განსაკუთრებული გჭირდებათ, მოგვწერეთ ან დაგვირეკეთ: {{phone}}.\n\nჯავშნის ნახვა ან შეცვლა: {{manageLink}}\n\nსასიამოვნო მგზავრობას გისურვებთ!\n{{hotelName}}",
    },
    en: {
      subject: "See you soon — {{hotelName}}, booking {{code}}",
      body: "Hello {{guestName}},\n\nWe're looking forward to welcoming you at {{hotelName}}. Check-in is on {{checkIn}} from {{checkInTime}}; check-out on {{checkOut}} until {{checkOutTime}}.\n\nAddress: {{address}}\nMap: {{mapLink}}\n\nIf you know your arrival time or need anything special, just reply or call us: {{phone}}.\n\nView or change your booking: {{manageLink}}\n\nSafe travels!\n{{hotelName}}",
    },
    ru: {
      subject: "До скорой встречи — {{hotelName}}, бронь {{code}}",
      body: "Здравствуйте, {{guestName}}!\n\nМы ждём вас в {{hotelName}}. Заезд — {{checkIn}} с {{checkInTime}}, выезд — {{checkOut}} до {{checkOutTime}}.\n\nАдрес: {{address}}\nКарта: {{mapLink}}\n\nЕсли знаете время прибытия или вам что-то нужно, просто ответьте на письмо или позвоните: {{phone}}.\n\nПосмотреть или изменить бронь: {{manageLink}}\n\nХорошей дороги!\n{{hotelName}}",
    },
  },
  post_stay: {
    ka: {
      subject: "მადლობა, რომ ჩვენთან დაისვენეთ, {{guestName}}",
      body: "გამარჯობა, {{guestName}}!\n\nდიდი მადლობა, რომ {{hotelName}} აირჩიეთ. იმედი გვაქვს, დასვენება სასიამოვნო იყო.\n\nდაგვეხმარებით, თუ ორი წუთით შეაფასებთ ვიზიტს? თქვენი აზრი ძალიან მნიშვნელოვანია ჩვენთვის და სხვა სტუმრებისთვის:\n{{reviewLink}}\n\nიმედია, მალე ისევ გნახავთ!\n{{hotelName}} · {{phone}}",
    },
    en: {
      subject: "Thank you for staying with us, {{guestName}}",
      body: "Hello {{guestName}},\n\nThank you for choosing {{hotelName}}. We hope you had a lovely stay.\n\nCould you spare two minutes to tell us how it was? Your review helps us — and future guests — a lot:\n{{reviewLink}}\n\nWe hope to welcome you again soon!\n{{hotelName}} · {{phone}}",
    },
    ru: {
      subject: "Спасибо, что выбрали нас, {{guestName}}",
      body: "Здравствуйте, {{guestName}}!\n\nСпасибо, что остановились в {{hotelName}}. Надеемся, отдых удался.\n\nУделите, пожалуйста, две минуты и оцените ваше пребывание — это очень поможет нам и будущим гостям:\n{{reviewLink}}\n\nБудем рады видеть вас снова!\n{{hotelName}} · {{phone}}",
    },
  },
  whatsapp: {
    ka: { subject: "", body: "გამარჯობა, {{guestName}}! გწერთ {{hotelName}}-დან. თქვენი ჯავშანი {{code}}: {{checkIn}} – {{checkOut}}. შესახლება {{checkInTime}}-დან. რამე თუ დაგჭირდათ, აქვე მოგვწერეთ." },
    en: { subject: "", body: "Hello {{guestName}}! This is {{hotelName}}. Your booking {{code}}: {{checkIn}} – {{checkOut}}. Check-in from {{checkInTime}}. If you need anything, just write to us here." },
    ru: { subject: "", body: "Здравствуйте, {{guestName}}! Пишем из {{hotelName}}. Ваша бронь {{code}}: {{checkIn}} – {{checkOut}}. Заезд с {{checkInTime}}. Если что-то понадобится, пишите сюда." },
  },
};

const lang = (l: string): "ka" | "en" | "ru" => (l === "en" || l === "ru" ? l : "ka");

export async function loadTemplate(key: TemplateKey, locale: string): Promise<Tpl & { custom: boolean }> {
  const l = lang(locale);
  const row = await db.emailTemplate.findUnique({ where: { key_locale: { key, locale: l } } });
  const def = DEFAULT_TEMPLATES[key][l];
  return { subject: row?.subject || def.subject, body: row?.body || def.body, custom: !!row };
}

type BookingLike = { code: string; checkIn: Date; checkOut: Date; locale: string; guest: { firstName: string } | null };

export function templateVars(b: BookingLike, settings: Settings): Record<string, string> {
  const l = lang(b.locale);
  const prefix = l === "ka" ? "" : `/${l}`;
  const ci = b.checkIn.toISOString().slice(0, 10), co = b.checkOut.toISOString().slice(0, 10);
  return {
    guestName: b.guest?.firstName ?? "", code: b.code, checkIn: ci, checkOut: co, nights: String(nightsBetween(ci, co)),
    hotelName: tr(settings.hotel.name, l) || "Royal Palace", checkInTime: settings.hotel.checkInFrom, checkOutTime: settings.hotel.checkOutUntil,
    address: tr(settings.hotel.address, l), phone: settings.contact.phone,
    mapLink: settings.hotel.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${settings.hotel.lat},${settings.hotel.lng}`,
    manageLink: `${SITE_URL}${prefix}/booking/manage?code=${encodeURIComponent(b.code)}`,
    reviewLink: `${SITE_URL}${prefix}/reviews?code=${encodeURIComponent(b.code)}#write`,
  };
}

export const fill = (text: string, vars: Record<string, string>) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#0b7d88">${u}</a>`);

/** Plain-text template → the hotel's e-mail look (same frame as the confirmation e-mail). */
export function templateHtml(body: string, settings: Settings, locale: string) {
  const paras = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;color:#1d4652;line-height:1.6">${linkify(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html lang="${lang(locale)}"><body style="margin:0;background:#f3f8f7;font-family:'Noto Sans Georgian','Noto Sans',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td align="left" style="background:#0b2e3a;padding:24px 28px;text-align:left"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="text-align:center;padding:0;color:#fff;font-family:Georgia,serif;font-size:26px;letter-spacing:4px">ROYAL PALACE</td></tr><tr><td align="center" style="text-align:center;padding:4px 0 0;font-family:Arial,sans-serif;font-size:10px;letter-spacing:4px;color:#a3e8ee">HOTEL · KOBULETI</td></tr></table></td></tr>
<tr><td style="padding:28px">${paras}</td></tr>
<tr><td style="background:#f3f8f7;padding:16px 28px;font-size:12px;color:#4b6b75">${esc(tr(settings.hotel.address, lang(locale)))} · ${esc(settings.contact.phone)} · ${esc(settings.contact.email)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** WhatsApp click-to-chat link with the guest's localized message (null when there is no usable number). */
export async function whatsappLink(b: BookingLike & { guest: { firstName: string; phone: string | null } | null }, settings: Settings) {
  const digits = (b.guest?.phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 8) return null;
  const number = digits.length === 9 && digits.startsWith("5") ? `995${digits}` : digits; // local Georgian mobile → +995
  const tpl = await loadTemplate("whatsapp", b.locale);
  return `https://wa.me/${number}?text=${encodeURIComponent(fill(tpl.body, templateVars(b, settings)))}`;
}
