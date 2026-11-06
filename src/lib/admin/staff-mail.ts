import "server-only";
import { sendMail } from "@/lib/notify/email";
import { SITE_URL } from "@/lib/site-url";
import { adminT } from "@/lib/admin-i18n";
import { RESET_MINUTES } from "./passwords";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Password-reset e-mail in the staff member's admin language. */
export async function sendResetMail(user: { email: string; name: string; adminLocale: string }, token: string, invited = false) {
  const t = await adminT(user.adminLocale);
  const url = `${SITE_URL}/admin/reset?token=${encodeURIComponent(token)}`;
  const subject = invited ? t("auth.mail.inviteSubject") : t("auth.mail.resetSubject");
  const intro = invited ? t("auth.mail.inviteIntro") : t("auth.mail.resetIntro");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0b2e3a;max-width:520px">
<p>${esc(t("auth.mail.hello", { name: user.name }))}</p><p>${esc(intro)}</p>
<p><a href="${url}" style="display:inline-block;background:#0b2e3a;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(t("auth.mail.button"))}</a></p>
<p style="color:#5b7380;font-size:13px">${esc(t("auth.mail.expires", { minutes: RESET_MINUTES }))}<br>${esc(t("auth.mail.ignore"))}</p></div>`;
  return sendMail({ to: user.email, subject, html, text: `${intro}\n\n${url}\n\n${t("auth.mail.expires", { minutes: RESET_MINUTES })}` });
}
