import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { can, type RoleName } from "@/lib/permissions";
import { tr } from "@/lib/i18n-content";
import { todayBoard } from "@/lib/admin/today";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { HousekeepingBoard, type HkRoom } from "@/components/admin/HousekeepingBoard";

export const metadata: Metadata = { title: "Housekeeping" };

async function Housekeeping() {
  await connection();
  const user = await requirePermission("housekeeping");
  const t = await adminT(user.adminLocale);
  const board = await todayBoard();
  const name = (g?: { firstName: string; lastName: string } | null) => (g ? `${g.firstName} ${g.lastName}` : "—");
  const stamp = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(5, 16).replace("T", " ").replace("-", ".");
  const rooms: HkRoom[] = board.rooms.map(({ room: r, arriving, departing, staying, blocked }) => ({
    id: r.id, number: r.number, floor: r.floor, type: tr(r.roomType.name, user.adminLocale), status: r.housekeeping,
    note: r.housekeepingNote, changedAt: r.housekeepingAt ? stamp(r.housekeepingAt) : null, changedBy: r.housekeepingBy,
    arriving: arriving ? { guest: arriving.kind === "BOOKING" ? name(arriving.booking?.guest) : t("cal.legend.EXTERNAL"), time: arriving.booking?.arrivalTime ?? null, guests: `${arriving.adults}+${arriving.children}` } : null,
    departing: departing ? { guest: name(departing.booking?.guest) } : null,
    staying: !!staying, blocked: blocked ? blocked.note ?? t("cal.legend.MAINTENANCE") : null,
  }));
  return (
    <AdminFrame user={user} title={t("nav.housekeeping")}>
      <AutoRefresh seconds={30} />
      <p className="mb-3 text-sm text-ink-700">{t("hk.today", { date: board.today })}</p>
      <HousekeepingBoard rooms={rooms} canUpdate={can(user.role as RoleName, "housekeeping.update")} canInspect={can(user.role as RoleName, "housekeeping.inspect")} />
    </AdminFrame>
  );
}

export default function HousekeepingPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Housekeeping /></Suspense>;
}
