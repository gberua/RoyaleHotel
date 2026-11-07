import "server-only";
import { db } from "@/lib/db";
import { addDaysIso, todayInGeorgia, toDate } from "@/lib/booking/dates";

/**
 * Today's room situation (Tbilisi time): who arrives, who leaves, who stays, which rooms are blocked.
 * Shared by the dashboard and the housekeeping screen.
 */
export async function todayBoard(today = todayInGeorgia()) {
  const d = toDate(today), next = toDate(addDaysIso(today, 1));
  const [rooms, allocs] = await Promise.all([
    db.room.findMany({ where: { active: true }, include: { roomType: { select: { name: true, sortOrder: true } } }, orderBy: [{ floor: "asc" }, { number: "asc" }] }),
    db.roomAllocation.findMany({
      where: { active: true, checkIn: { lte: next }, checkOut: { gte: d }, kind: { in: ["BOOKING", "EXTERNAL", "MAINTENANCE"] } },
      include: { booking: { select: { id: true, code: true, status: true, arrivalTime: true, adults: true, children: true, specialRequests: true, grandTotal: true, amountPaid: true, guest: { select: { firstName: true, lastName: true, phone: true } } } } },
    }),
  ]);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const live = (a: (typeof allocs)[number]) => a.kind !== "BOOKING" || ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(a.booking?.status ?? "");
  const byRoom = rooms.map((r) => {
    const mine = allocs.filter((a) => a.roomId === r.id && live(a));
    const arriving = mine.find((a) => a.kind === "BOOKING" && iso(a.checkIn) === today && a.booking?.status !== "CHECKED_IN");
    const departing = mine.find((a) => a.kind === "BOOKING" && iso(a.checkOut) === today);
    const staying = mine.find((a) => a.kind !== "MAINTENANCE" && iso(a.checkIn) <= today && iso(a.checkOut) > today);
    const blocked = mine.find((a) => a.kind === "MAINTENANCE" && iso(a.checkIn) <= today && iso(a.checkOut) > today);
    return { room: r, arriving, departing, staying, blocked };
  });
  return { today, rooms: byRoom };
}
export type TodayRoom = Awaited<ReturnType<typeof todayBoard>>["rooms"][number];
