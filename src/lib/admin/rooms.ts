import "server-only";
import { db } from "@/lib/db";
import { todayInGeorgia, toDate } from "@/lib/booking/dates";

/** Bookings that still need these rooms (stay not finished, not cancelled). */
export async function futureBookingsForRooms(roomIds: string[]) {
  if (!roomIds.length) return [];
  const rows = await db.roomAllocation.findMany({
    where: { roomId: { in: roomIds }, active: true, kind: { in: ["BOOKING", "HOLD"] }, checkOut: { gt: toDate(todayInGeorgia()) }, booking: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } } },
    select: { booking: { select: { code: true, checkIn: true } }, room: { select: { number: true } } },
    orderBy: { checkIn: "asc" },
  });
  return rows.filter((r) => r.booking).map((r) => ({ code: r.booking!.code, room: r.room.number, checkIn: r.booking!.checkIn.toISOString().slice(0, 10) }));
}

/** Any allocation history at all (past bookings keep a foreign key → the room can only be archived). */
export async function roomHasHistory(roomIds: string[]) {
  return (await db.roomAllocation.count({ where: { roomId: { in: roomIds } } })) > 0;
}

/**
 * Deletion rule: delete only when nothing has ever been booked; with future bookings → refuse and list them;
 * with only past history → archive instead.
 */
export async function deletionVerdict(roomIds: string[]): Promise<{ canDelete: true } | { canDelete: false; reason: "has_future_bookings" | "has_history"; bookings: { code: string; room: string; checkIn: string }[] }> {
  const future = await futureBookingsForRooms(roomIds);
  if (future.length) return { canDelete: false, reason: "has_future_bookings", bookings: future };
  if (await roomHasHistory(roomIds)) return { canDelete: false, reason: "has_history", bookings: [] };
  return { canDelete: true };
}
