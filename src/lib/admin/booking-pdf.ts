import "server-only";
import { currentStaff } from "@/lib/admin-auth";
import { can, type RoleName } from "@/lib/permissions";
import { loadBooking, type FullBooking } from "@/lib/booking/load";
import { loadSettings } from "@/lib/booking/service";
import { messagesFor } from "@/lib/notify/booking-mail";
import type { Settings } from "@/lib/settings-schema";

/** Shared handler for staff PDF downloads of one booking (language: ?lang=ka|en|ru, default the guest's). */
export async function bookingPdf(req: Request, code: string, kind: string, render: (b: FullBooking, s: Settings, m: Record<string, unknown>, l: string) => Promise<Buffer>) {
  const user = await currentStaff();
  if (!user || !can(user.role as RoleName, "bookings")) return new Response("Unauthorized", { status: 401 });
  const b = await loadBooking({ code: decodeURIComponent(code) });
  if (!b) return new Response("Not found", { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang") ?? b.locale;
  const [{ locale, messages }, settings] = await Promise.all([messagesFor(lang), loadSettings()]);
  const pdf = await render(b, settings, messages, locale);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${kind}-${b.code}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
