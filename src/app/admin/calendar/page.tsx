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

export const metadata: Metadata = { title: "Calendar" };

const COLORS: Record<string, string> = {
  PENDING: "bg-amber-300 text-amber-950", HOLD: "bg-amber-200 text-amber-950 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(255_255_255/.45)_6px,rgb(255_255_255/.45)_12px)]",
  CONFIRMED: "bg-sea-500 text-ink-950", CHECKED_IN: "bg-emerald-500 text-white", CHECKED_OUT: "bg-ink-300 text-ink-900",
  EXTERNAL: "bg-violet-400 text-white", MAINTENANCE: "bg-red-400 text-white",
};
const LEGEND = ["CONFIRMED", "PENDING", "HOLD", "CHECKED_IN", "CHECKED_OUT", "EXTERNAL", "MAINTENANCE"];
const HK: Record<string, string> = { CLEAN: "bg-emerald-500", DIRTY: "bg-amber-500", INSPECTED: "bg-sea-500", OUT_OF_ORDER: "bg-red-500" };

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
  const cols = { gridTemplateColumns: `repeat(${days}, minmax(${days === 30 ? 34 : 56}px, 1fr))` };
  const link = (s: string, d = days) => `/admin/calendar?start=${s}&days=${d}`;
  const rows = rooms.map((r, i) => ({ r, typeName: tr(r.roomType.name, user.adminLocale), header: i === 0 || r.roomTypeId !== rooms[i - 1].roomTypeId }));

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
        {LEGEND.map((k) => <span key={k} className="flex items-center gap-1.5"><span className={`h-3 w-6 rounded ${COLORS[k]}`} />{t(`cal.legend.${k}`)}</span>)}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100" data-testid="timeline">
        <div className="min-w-max">
          <div className="sticky top-0 z-10 flex border-b border-ink-100 bg-white">
            <div className="sticky left-0 z-10 w-40 shrink-0 border-r border-ink-100 bg-white px-3 py-2 text-xs font-semibold text-ink-500">{t("bk.room")}</div>
            <div className="grid flex-1" style={cols}>
              {dates.map((d) => (
                <div key={d} className={`border-r border-ink-100 px-1 py-1.5 text-center text-[0.68rem] leading-tight ${d === today ? "bg-sea-50 font-bold text-sea-900" : isWeekendNight(d) ? "bg-mist" : ""}`}>
                  {t(`weekdaysShort.${(toDate(d).getUTCDay() + 6) % 7}`)}<br />{d.slice(8)}.{d.slice(5, 7)}
                </div>
              ))}
            </div>
          </div>
          {rows.map(({ r, typeName, header }) => {
            return (
              <div key={r.id}>
                {header && <div className="sticky left-0 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{typeName}</div>}
                <div className="flex border-b border-ink-100 last:border-0">
                  <div className="sticky left-0 z-[5] flex w-40 shrink-0 items-center gap-2 border-r border-ink-100 bg-white px-3 py-2 text-sm">
                    <span className={`h-2.5 w-2.5 rounded-full ${HK[r.housekeeping]}`} title={t(`cal.hk.${r.housekeeping}`)} />
                    <strong>{r.number}</strong>
                  </div>
                  <div className="relative grid flex-1" style={cols}>
                    {dates.map((d) => <div key={d} className={`h-11 border-r border-ink-100 ${d === today ? "bg-sea-50/60" : isWeekendNight(d) ? "bg-mist/50" : ""}`} />)}
                    {(byRoom.get(r.id) ?? []).map((a) => {
                      const ci = a.checkIn.toISOString().slice(0, 10), co = a.checkOut.toISOString().slice(0, 10);
                      const s = Math.max(0, nightsBetween(start, ci));
                      const e = Math.min(days, nightsBetween(start, co));
                      if (e <= s) return null;
                      const status = a.kind === "BOOKING" ? a.booking?.status ?? "CONFIRMED" : a.kind;
                      const key = a.kind === "HOLD" ? "HOLD" : status;
                      const text = a.booking ? `${a.booking.guest?.lastName ?? "…"} · ${a.booking.code.startsWith("HOLD-") ? t("cal.legend.HOLD") : a.booking.code}` : a.note ?? t(`cal.legend.${a.kind}`);
                      const cls = `absolute inset-y-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2 text-[0.72rem] font-semibold leading-8 shadow-sm ${COLORS[key] ?? "bg-ink-300"} ${ci < start ? "rounded-l-none" : ""}`;
                      const style = { left: `calc(${(s / days) * 100}% + ${ci < start ? 0 : 3}px)`, width: `calc(${((e - s) / days) * 100}% - ${ci < start ? 3 : 6}px)` };
                      const title = `${text} · ${ci} → ${co}`;
                      return a.booking && !a.booking.code.startsWith("HOLD-")
                        ? <Link key={a.id} href={`/admin/bookings/${a.booking.code}`} data-testid="timeline-bar" className={`${cls} hover:ring-2 hover:ring-ink-900/30 focus-visible:ring-2`} style={style} title={title}>{text}</Link>
                        : <span key={a.id} className={cls} style={style} title={title}>{text}</span>;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminFrame>
  );
}

export default function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Timeline searchParams={searchParams} /></Suspense>;
}
