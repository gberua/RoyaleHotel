import { db } from "@/lib/db";
import { currentStaff } from "@/lib/admin-auth";
import { can, type RoleName } from "@/lib/permissions";
import { tr } from "@/lib/i18n-content";
import { bookingFilter } from "@/lib/booking/admin-filter";

/** CSV export (opens in Excel / Google Sheets). UTF-8 with BOM so Georgian text shows correctly in Excel. */
export async function GET(req: Request) {
  const user = await currentStaff(); // also rejects deactivated users and sessions older than a password change
  if (!user || !can(user.role as RoleName, "bookings")) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await db.booking.findMany({ where: bookingFilter(sp), orderBy: { checkIn: "asc" }, include: { guest: true, rooms: { where: { active: true }, include: { room: { include: { roomType: true } } } } } });
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; // CSV-injection safe
  };
  const head = ["code", "status", "source", "check_in", "check_out", "nights", "rooms", "adults", "children", "guest", "email", "phone", "country", "total_gel", "paid_gel", "balance_gel", "payment", "plan", "promo_discount_gel", "created"];
  const lines = rows.map((b) => [
    b.code, b.status, b.source, b.checkIn.toISOString().slice(0, 10), b.checkOut.toISOString().slice(0, 10), Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000),
    b.rooms.map((r) => `${r.room.number} ${tr(r.room.roomType.name, "en")}`).join(" | "), b.adults, b.children,
    b.guest ? `${b.guest.firstName} ${b.guest.lastName}` : "", b.guest?.email, b.guest?.phone, b.guest?.country,
    (b.grandTotal / 100).toFixed(2), (b.amountPaid / 100).toFixed(2), (Math.max(0, b.grandTotal - b.amountPaid) / 100).toFixed(2), b.paymentStatus, b.paymentPlan, (b.discountTotal / 100).toFixed(2), b.createdAt.toISOString(),
  ].map(cell).join(","));
  return new Response("﻿" + [head.join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="royal-palace-bookings-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
