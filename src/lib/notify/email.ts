import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Attachment = { filename: string; content: Buffer; contentType?: string };
export type Mail = { to: string | string[]; subject: string; html: string; text?: string; attachments?: Attachment[]; replyTo?: string };

const OUTBOX = join(process.cwd(), "storage", "outbox");

/**
 * Sends via Resend when RESEND_API_KEY is set. Without a key (development / before the domain is
 * verified) every email is written to storage/outbox/ so nothing is lost and it can be inspected.
 */
export async function sendMail(mail: Mail): Promise<{ ok: boolean; id?: string; outbox?: string }> {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];
  const from = process.env.EMAIL_FROM || "Royale Hotel <booking@royalehotel.ge>";
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to, subject: mail.subject, html: mail.html, text: mail.text, reply_to: mail.replyTo,
        attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
    if (res.ok) return { ok: true, id: ((await res.json()) as { id?: string }).id };
    console.error("[email] Resend error", res.status, await res.text().catch(() => ""));
  }
  await mkdir(OUTBOX, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = join(OUTBOX, `${stamp}-${to[0].replace(/[^a-z0-9@.]/gi, "_")}`);
  await writeFile(`${base}.html`, `<!-- To: ${to.join(", ")} | From: ${from} | Subject: ${mail.subject} -->\n${mail.html}`);
  for (const a of mail.attachments ?? []) await writeFile(`${base}-${a.filename}`, a.content);
  console.info(`[email] ${process.env.RESEND_API_KEY ? "Resend failed — " : ""}saved to outbox: ${base}.html (${mail.subject})`);
  return { ok: !process.env.RESEND_API_KEY, outbox: `${base}.html` };
}
