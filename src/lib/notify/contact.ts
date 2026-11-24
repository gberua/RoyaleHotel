import "server-only";
import { loadSettings } from "@/lib/booking/service";
import { sendMail } from "./email";
import { sendTelegram } from "./telegram";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A message from the website's contact form goes to the hotel (e-mail + Telegram); "Reply" answers the visitor. */
export async function notifyContactMessage(m: { name: string; email: string; phone?: string | null; subject?: string | null; message: string; locale?: string | null }) {
  const settings = await loadSettings();
  const to = settings.notifications.adminEmails.length ? settings.notifications.adminEmails : [settings.contact.bookingEmail || settings.contact.email].filter(Boolean);
  const lines = [
    `<b>Website message</b>${m.subject ? ` · ${esc(m.subject)}` : ""}`,
    `From: ${esc(m.name)} · ${esc(m.email)}${m.phone ? ` · ${esc(m.phone)}` : ""}${m.locale ? ` · ${esc(m.locale)}` : ""}`,
    "",
    esc(m.message),
  ];
  await Promise.allSettled([
    to.length ? sendMail({ to, replyTo: m.email, subject: `[Royal Palace] Website message from ${m.name}${m.subject ? ` — ${m.subject}` : ""}`.slice(0, 200), html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${lines.join("<br>").replace(/\n/g, "<br>")}</div>` }) : Promise.resolve(),
    sendTelegram(lines.join("\n")),
  ]);
}
