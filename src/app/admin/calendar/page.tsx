import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { addDaysIso, isIsoDate, isWeekendNight, nightsBetween, todayInGeorgia, toDate } from "@/lib/booking/dates";
import { releaseExpired } from "@/lib/booking/service";
import { tr } from "@/lib/i18n-content";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { CalendarGrid, type CalBar, type CalRow } from "@/components/admin/CalendarGrid";
import { BAR_COLORS } from "@/lib/admin/calendar-colors";

export const metadata: Metadata = { title: "Calendar" };

const LEGEND = ["CONFIRMED", "PENDING", "HOLD", "CHECKED_IN", "CHECKED_OUT", "EXTERNAL", "MAINTENANCE"];

async function Timeline({ searchParams }: { searchParams: PageProps<"/admin/calendar">["searchParams"] }) {
  await connection();
  const user = await requirePermission("calendar");
  const t = await adminT(user.adminLocale);
  await releaseExpired();
  const sp = await searchParams;
  const today = todayInGeorgia();
  const days = sp.days === "30" ? 30 : 14;
  const start = typeof sp.start === "string" && isIsoDate(sp.start) ? sp.start : addDaysIso(today, -1);
  const end = addDaysIso(start, days);
  const dates = Array.from({ length: days }, (_, i) => addDaysIso(start, i));
  const [rooms, allocs] = await Promise.all([
    db.room.findMany({ where: { active: true }, include: { roomType: { select: { name: true, sortOrder: true } } }, orderBy: [{ roomType: { sortOrder: "asc" } }, { number: "asc" }] }),
    db.roomAllocation.findMany({
      where: { active: true, checkIn: { lt: toDate(end) }, checkOut: { gt: toDate(start) }, OR: [{ kind: { not: "HOLD" } }, { holdExpiresAt: { gt: new Date() } }] },
      include: { booking: { select: { code: true, status: true, guest: { select: { lastName: true, firstName: true } } } } },
    }),
  ]);
  const byRoom = new Map<string, typeof allocs>();
  for (const a of allocs) byRoom.set(a.roomId, [...(byRoom.get(a.roomId) ?? []), a]);
  const occupiedTonight = allocs.filter((a) => a.checkIn.toISOString().slice(0, 10) <= today && a.checkOut.toISOString().slice(0, 10) > today).length;
  const link = (s: string, d = days) => `/admin/calendar?start=${s}&days=${d}`;
  const calRows: CalRow[] = rooms.map((r, i) => ({ id: r.id, number: r.number, typeId: r.roomTypeId, typeName: tr(r.roomType.name, user.adminLocale), header: i === 0 || r.roomTypeId !== rooms[i - 1].roomTypeId, hk: r.housekeeping }));
  const bars: CalBar[] = allocs.flatMap((a) => {
    const ci = a.checkIn.toISOString().slice(0, 10), co = a.checkOut.toISOString().slice(0, 10);
    const s = nightsBetween(start, ci), e = nightsBetween(start, co);
    if (e <= 0 || s >= days) return [];
    const status = a.kind === "BOOKING" ? a.booking?.status ?? "CONFIRMED" : a.kind;
    const key = a.kind === "HOLD" ? "HOLD" : status;
    const real = !!a.booking && !a.booking.code.startsWith("HOLD-");
    const text = a.booking ? `${a.booking.guest?.lastName ?? "…"} · ${real ? a.booking.code : t("cal.legend.HOLD")}` : a.note ?? t(`cal.legend.${a.kind}`);
    return [{ id: a.id, roomId: a.roomId, s, e, ci, colorKey: key, text, title: `${text} · ${ci} → ${co}`, href: real ? `/admin/bookings/${a.booking!.code}` : null, movable: real && a.kind === "BOOKING" && ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(status) }];
  });

  return (
    <AdminFrame user={user} title={t("nav.calendar")} wide actions={
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-2 text-ink-500">{t("cal.tonight", { occupied: occupiedTonight, total: rooms.length, pct: Math.round((occupiedTonight / Math.max(1, rooms.length)) * 100) })}</span>
        <Link href={link(addDaysIso(start, -days))} className="btn btn-ghost !min-h-9 !px-3" aria-label={t("rates.prev")}><ChevronLeft size={16} /></Link>
        <Link href={link(addDaysIso(today, -1))} className="btn btn-ghost !min-h-9 !px-3">{t("rates.today")}</Link>
        <Link href={link(addDaysIso(start, days))} className="btn btn-ghost !min-h-9 !px-3" aria-label={t("rates.next")}><ChevronRight size={16} /></Link>
        <Link href={link(start, days === 14 ? 30 : 14)} className="btn btn-ghost !min-h-9 !px-3">{t("cal.days", { n: days === 14 ? 30 : 14 })}</Link>
        <form className="flex items-center gap-1"><input type="date" name="start" defaultValue={start} className="field !min-h-9 !w-auto !py-1 text-sm" /><input type="hidden" name="days" value={days} /><button className="btn btn-ghost !min-h-9 !px-3">→</button></form>
      </div>
    }>
      <AutoRefresh seconds={30} />
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {LEGEND.map((k) => <span key={k} className="flex items-center gap-1.5"><span className={`h-3 w-6 rounded ${BAR_COLORS[k]}`} />{t(`cal.legend.${k}`)}</span>)}
      </div>
      <p className="mb-2 text-xs text-ink-500">{t("cal.help")}</p>
      <CalendarGrid rows={calRows} bars={bars} dates={dates} today={today} weekend={dates.filter(isWeekendNight)} />
    </AdminFrame>
  );
}

export default function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Timeline searchParams={searchParams} /></Suspense>;
}
