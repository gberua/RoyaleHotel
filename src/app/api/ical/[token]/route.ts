import { db } from "@/lib/db";
import { exportRoomTypeIcal } from "@/lib/ical/sync";

/** Public iCal export for Booking.com / Airbnb / Expedia (secret token in the URL). */
export async function GET(_req: Request, ctx: RouteContext<"/api/ical/[token]">) {
  const { token } = await ctx.params;
  const feed = await db.icalFeed.findUnique({ where: { exportToken: token.replace(/\.ics$/, "") } });
  if (!feed?.roomTypeId || !feed.active) return new Response("Not found", { status: 404 });
  return new Response(await exportRoomTypeIcal(feed.roomTypeId), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `inline; filename="royale-${feed.id}.ics"` },
  });
}
