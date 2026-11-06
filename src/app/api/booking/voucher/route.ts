import { bookingAccess } from "@/lib/booking/guest-session";
import { loadBooking } from "@/lib/booking/load";
import { loadSettings } from "@/lib/booking/service";
import { messagesFor } from "@/lib/notify/booking-mail";
import { renderVoucher } from "@/lib/notify/voucher";

/** PDF voucher for the booking this browser is allowed to see (signed cookie — no personal data in the URL). */
export async function GET() {
  const id = await bookingAccess();
  if (!id) return new Response("Not found", { status: 404 });
  const b = await loadBooking({ id });
  if (!b || b.code.startsWith("HOLD-")) return new Response("Not found", { status: 404 });
  const [settings, { messages }] = await Promise.all([loadSettings(), messagesFor(b.locale)]);
  const pdf = await renderVoucher(b, settings, messages);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${b.code}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
