import "server-only";
import { db } from "@/lib/db";

/** Everything needed to show / email / print a booking. */
export async function loadBooking(where: { id: string } | { code: string }) {
  return db.booking.findUnique({
    where,
    include: {
      guest: true,
      rooms: { include: { room: { include: { roomType: { select: { name: true, slug: true } } } } }, orderBy: { createdAt: "asc" } },
      extras: { include: { extra: { select: { name: true, key: true } } } },
      payments: { orderBy: { createdAt: "asc" } },
      promoCode: { select: { code: true } },
      notes: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}
export type FullBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;
