import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AlertTriangle, ArrowRight, BedDouble, CalendarCheck, LogIn, LogOut, Sparkles, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { currentStaff } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { can, homeFor, type RoleName } from "@/lib/permissions";
import { addDaysIso, todayInGeorgia, toDate } from "@/lib/booking/dates";
import { releaseExpired } from "@/lib/booking/service";
import { periodStats, type StayLine } from "@/lib/admin/metrics";
import { todayBoard } from "@/lib/admin/today";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/i18n-content";
import { AdminFrame, StatusChip } from "@/components/admin/AdminFrame";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { StatusButton } from "@/components/admin/StatusButton";

export const metadata: Metadata = { title: "Dashboard" };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Tile({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (<><p className="text-xs font-medium text-ink-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>{sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}</>);
  return href ? <Link href={href} className="block rounded-2xl bg-white p-4 ring-1 ring-ink-100 hover:ring-sea-500">{body}</Link> : <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">{body}</div>;
}

async function Dashboard() {
  await connection();
  const user = await currentStaff();
  if (!user) redirect("/admin/login");
  if (!can(user.role as RoleName, "dashboard")) redirect(homeFor(user.role as RoleName));
  const t = await adminT(user.adminLocale);
  const L = user.adminLocale;
  // money totals are for owners & managers; reception only sees what guests still owe
  const showMoney = can(user.role as RoleName, "reports");
  await releaseExpired();

  const today = todayInGeorgia();
  const yesterdayStart = new Date(toDate(addDaysIso(today, -1)).getTime() - 4 * 3600_000); // 00:00 Tbilisi time
  const monthStart = `${today.slice(0, 8)}01`;
  const nextMonth = addDaysIso(`${today.slice(0, 8)}28`, 4).slice(0, 8) + "01";
  const season = await db.season.findFirst({ where: { endDate: { gte: toDate(today) } }, orderBy: { startDate: "asc" } });
  const sFrom = season ? iso(season.startDate) : monthStart;
  const sTo = season ? addDaysIso(iso(season.endDate), 1) : nextMonth;
  const spanFrom = [monthStart, sFrom, today].sort()[0];
  const spanTo = [nextMonth, sTo, addDaysIso(today, 7)].sort().at(-1)!;

  const [board, roomsCount, allocs, unpaid, created, cancelled] = await Promise.all([
    todayBoard(today),
    db.room.count({ where: { active: true } }),
    db.roomAllocation.findMany({
      where: { active: true, kind: { in: ["BOOKING", "EXTERNAL"] }, checkIn: { lt: toDate(spanTo) }, checkOut: { gt: toDate(spanFrom) }, OR: [{ kind: "EXTERNAL" }, { booking: { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } } }] },
      select: { checkIn: true, checkOut: true, nightlyPrices: true, kind: true },
    }),
    db.booking.findMany({ where: { status: { in: ["CONFIRMED", "CHECKED_IN"] }, NOT: { code: { startsWith: "HOLD-" } } }, select: { grandTotal: true, amountPaid: true } }),
    db.booking.findMany({ where: { createdAt: { gte: yesterdayStart }, NOT: { code: { startsWith: "HOLD-" } }, status: { notIn: ["EXPIRED"] } }, orderBy: { createdAt: "desc" }, take: 20, include: { guest: { select: { firstName: true, lastName: true } } } }),
    db.booking.findMany({ where: { cancelledAt: { gte: yesterdayStart } }, orderBy: { cancelledAt: "desc" }, take: 20, include: { guest: { select: { firstName: true, lastName: true } } } }),
  ]);
  const lines: StayLine[] = allocs.map((a) => ({ checkIn: iso(a.checkIn), checkOut: iso(a.checkOut), nightlyPrices: a.nightlyPrices, withRevenue: a.kind === "BOOKING" }));
  const oooRooms = board.rooms.filter((r) => r.room.housekeeping === "OUT_OF_ORDER" || r.blocked);
  const sellable = Math.max(1, roomsCount - oooRooms.length);
  const tonight = periodStats(lines, sellable, today, addDaysIso(today, 1));
  const week = periodStats(lines, roomsCount, today, addDaysIso(today, 7));
  const seasonS = periodStats(lines, roomsCount, sFrom, sTo);
  const month = periodStats(lines, roomsCount, monthStart, nextMonth);
  const due = unpaid.filter((b) => b.grandTotal > b.amountPaid);
  const dueTotal = due.reduce((s, b) => s + b.grandTotal - b.amountPaid, 0);
  const money = (n: number) => formatMoney(n, undefined, "en");
  const guest = (g?: { firstName: string; lastName: string } | null) => (g ? `${g.firstName} ${g.lastName}` : "—");

  const arrivals = board.rooms.filter((r) => r.arriving?.booking).map((r) => ({ a: r.arriving!, room: r.room }));
  const departures = board.rooms.filter((r) => r.departing?.booking?.status === "CHECKED_IN").map((r) => ({ a: r.departing!, room: r.room }));
  const dirty = board.rooms.filter((r) => r.room.housekeeping === "DIRTY");
  const ready = (s: string) => s === "CLEAN" || s === "INSPECTED";

  const list = (title: string, icon: ReactNode, items: ReactNode[], empty: string, testid: string) => (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-ink-100" data-testid={testid}>
      <h2 className="mb-3 flex items-center gap-2 font-sans text-base font-semibold">{icon}{title} <span className="text-ink-500">· {items.length}</span></h2>
      {items.length ? <ul className="divide-y divide-ink-100">{items}</ul> : <p className="text-sm text-ink-500">{empty}</p>}
    </section>
  );

  return (
    <AdminFrame user={user} title={t("dash.title")} wide actions={<Link href="/admin/bookings/new" className="btn btn-primary !min-h-10 text-sm">{t("nav.newBooking")}</Link>}>
      <AutoRefresh seconds={60} />
      <p className="mb-4 text-sm text-ink-700">{t("dash.today", { date: today })}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="dash-tiles">
        <Tile label={t("dash.occTonight")} value={pct(tonight.occupancy)} sub={t("dash.roomsOf", { n: tonight.occupied, total: sellable })} href="/admin/calendar" />
        <Tile label={t("dash.occWeek")} value={pct(week.occupancy)} sub={t("dash.next7")} />
        <Tile label={season ? t("dash.occSeason", { name: tr(season.name, L) }) : t("dash.occMonth")} value={pct(seasonS.occupancy)} sub={`${sFrom} → ${addDaysIso(sTo, -1)}`} />
        {showMoney && <Tile label={t("dash.revToday")} value={money(tonight.revenue)} sub={t("dash.roomRevenue")} />}
        {showMoney && <Tile label={t("dash.revMonth")} value={money(month.revenue)} sub={season ? t("dash.revSeason", { amount: money(seasonS.revenue) }) : t("dash.roomRevenue")} />}
        <Tile label={t("dash.unpaid")} value={money(dueTotal)} sub={t("dash.unpaidSub", { count: due.length })} href="/admin/bookings?sort=checkin" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {list(t("dash.arrivals"), <LogIn size={18} className="text-sea-700" />, arrivals.map(({ a, room }) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <Link href={`/admin/bookings/${a.booking!.code}`} className="font-semibold hover:underline">{guest(a.booking!.guest)}</Link>
              <p className="text-xs text-ink-500">{t("bk.room")} {room.number} · {a.adults}+{a.children}{a.booking!.arrivalTime ? ` · ${a.booking!.arrivalTime}` : ""}{a.booking!.grandTotal > a.booking!.amountPaid ? ` · ${t("dash.toPay", { amount: money(a.booking!.grandTotal - a.booking!.amountPaid) })}` : ""}</p>
              {!ready(room.housekeeping) && <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-800"><AlertTriangle size={12} aria-hidden />{t(`cal.hk.${room.housekeeping}`)}</p>}
            </div>
            {a.booking!.status === "CONFIRMED" && <StatusButton code={a.booking!.code} to="CHECKED_IN" label={t("bk.to.CHECKED_IN")} small />}
            {a.booking!.status === "PENDING" && <StatusChip status="PENDING" label={t("bk.status.PENDING")} />}
          </li>
        )), t("dash.noArrivals"), "dash-arrivals")}
        {list(t("dash.departures"), <LogOut size={18} className="text-sea-700" />, departures.map(({ a, room }) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div>
              <Link href={`/admin/bookings/${a.booking!.code}`} className="font-semibold hover:underline">{guest(a.booking!.guest)}</Link>
              <p className="text-xs text-ink-500">{t("bk.room")} {room.number}{a.booking!.grandTotal > a.booking!.amountPaid ? ` · ${t("dash.toPay", { amount: money(a.booking!.grandTotal - a.booking!.amountPaid) })}` : ""}</p>
            </div>
            <StatusButton code={a.booking!.code} to="CHECKED_OUT" label={t("bk.to.CHECKED_OUT")} small />
          </li>
        )), t("dash.noDepartures"), "dash-departures")}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {list(t("dash.newBookings"), <CalendarCheck size={18} className="text-sea-700" />, created.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 truncate"><Link href={`/admin/bookings/${b.code}`} className="font-mono font-semibold text-sea-800 hover:underline">{b.code}</Link> · {guest(b.guest)}<span className="block text-xs text-ink-500">{iso(b.checkIn)} → {iso(b.checkOut)} · {t(`bk.sources.${b.source}`)}</span></span>
            {showMoney && <span className="tabular-nums">{money(b.grandTotal)}</span>}
          </li>
        )), t("dash.none"), "dash-new")}
        {list(t("dash.cancellations"), <AlertTriangle size={18} className="text-danger" />, cancelled.map((b) => (
          <li key={b.id} className="py-2 text-sm"><Link href={`/admin/bookings/${b.code}`} className="font-mono font-semibold text-sea-800 hover:underline">{b.code}</Link> · {guest(b.guest)}<span className="block text-xs text-ink-500">{iso(b.checkIn)} → {iso(b.checkOut)}</span></li>
        )), t("dash.none"), "dash-cancelled")}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <h2 className="mb-3 flex items-center gap-2 font-sans text-base font-semibold"><BedDouble size={18} className="text-sea-700" />{t("dash.rooms")}</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm"><Sparkles size={15} className="text-amber-600" />{t("dash.dirty", { count: dirty.length })}{dirty.length > 0 && <span className="text-ink-500">· {dirty.map((r) => r.room.number).join(", ")}</span>}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm"><Wrench size={15} className="text-red-700" />{t("dash.ooo", { count: oooRooms.length })}{oooRooms.length > 0 && <span className="text-ink-500">· {oooRooms.map((r) => r.room.number).join(", ")}</span>}</p>
          <Link href="/admin/housekeeping" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sea-700 hover:underline">{t("nav.housekeeping")} <ArrowRight size={14} /></Link>
        </section>
      </div>
    </AdminFrame>
  );
}

export default function AdminHome() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Dashboard /></Suspense>;
}
