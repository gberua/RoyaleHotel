import "server-only";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/settings-schema";

/**
 * Hotel alerts to a Telegram chat. The bot token stays in .env (TELEGRAM_BOT_TOKEN); the chat id and the
 * on/off switch come from Settings → Notifications (falling back to TELEGRAM_CHAT_ID).
 */
export async function sendTelegram(html: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const row = await db.setting.findUnique({ where: { key: "notifications" } }).catch(() => null);
  const n = settingsSchema.shape.notifications.parse(row?.value ?? {});
  const chat = (n.telegramEnabled && n.telegramChatId) || (!row && process.env.TELEGRAM_CHAT_ID) || "";
  if (!token || !chat) {
    console.info("[telegram] not configured or switched off — message:\n" + html.replace(/<[^>]+>/g, ""));
    return { ok: false, skipped: true };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("[telegram] error", res.status, await res.text().catch(() => ""));
  return { ok: res.ok };
}
