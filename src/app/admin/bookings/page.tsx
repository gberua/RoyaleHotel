import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Download, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { releaseExpired } from "@/lib/booking/service";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/i18n-content";
import { AdminFrame, StatusChip } from "@/components/admin/AdminFrame";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { bookingFilter, BOOKING_STATUSES as STATUSES } from "@/lib/booking/admin-filter";

export const metadata: Metadata = { title: "Bookings" };
const SOURCES = ["DIRECT", "PHONE", "WALK_IN", "WHATSAPP", "BOOKING_COM", "AIRBNB", "EXPEDIA", "OTHER"];

async function List({ searchParams }: { searchParams: PageProps<"/admin/bookings">["searchParams"] }) {
  await connection();
  const user = await requirePermission("bookings");
  const t = await adminT(user.adminLocale);
  await releaseExpired();
  const sp = await searchParams;
  const rows = await db.booking.findMany({
    where: bookingFilter(sp),
    orderBy: sp.sort === "checkin" ? { checkIn: "asc" } : { createdAt: "desc" },
    take: 300,
    include: { guest: true, rooms: { where: { active: true }, include: { room: { include: { roomType: { select: { name: true } } } } } } },
  });
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const money = (n: number) => formatMoney(n, undefined, "en");
  const sel = "field !min-h-10 !w-auto !py-1.5 text-sm";
  const heads = ["code", "guest", "dates", "rooms", "status", "payment", "total", "source", "created"];
  return (
    <AdminFrame user={user} title={t("bk.title")} actions={
      <div className="flex gap-2">
        <a href={`/admin/bookings/export?${qs}`} className="btn btn-ghost !min-h-10 text-sm"><Download size={15} aria-hidden /> CSV / Excel</a>
        <Link href="/admin/bookings/new" className="btn btn-primary !min-h-10 text-sm"><Plus size={15} aria-hidden /> {t("nav.newBooking")}</Link>
      </div>
    }>
      <AutoRefresh seconds={30} />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 ring-1 ring-ink-100">
        <label className="text-xs text-ink-500">{t("common.search")}<input name="q" defaultValue={String(sp.q ?? "")} placeholder={t("bk.searchHint")} className="field mt-1 !min-h-10 !py-1.5 text-sm" /></label>
        <label className="text-xs text-ink-500">{t("common.status")}<select name="status" defaultValue={String(sp.status ?? "")} className={`${sel} mt-1 block`}><option value="">{t("bk.activeOnly")}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`bk.status.${s}`)}</option>)}</select></label>
        <label className="text-xs text-ink-500">{t("bk.source")}<select name="source" defaultValue={String(sp.source ?? "")} className={`${sel} mt-1 block`}><option value="">{t("common.all")}</option>{SOURCES.map((s) => <option key={s} value={s}>{t(`bk.sources.${s}`)}</option>)}</select></label>
        <label className="text-xs text-ink-500">{t("bk.stayingFrom")}<input type="date" name="from" defaultValue={String(sp.from ?? "")} className={`${sel} mt-1 block`} /></label>
        <label className="text-xs text-ink-500">{t("common.to")}<input type="date" name="to" defaultValue={String(sp.to ?? "")} className={`${sel} mt-1 block`} /></label>
        <label className="text-xs text-ink-500">{t("bk.sort")}<select name="sort" defaultValue={String(sp.sort ?? "")} className={`${sel} mt-1 block`}><option value="">{t("bk.newest")}</option><option value="checkin">{t("bk.byArrival")}</option></select></label>
        <button className="btn btn-primary !min-h-10 text-sm">{t("bk.filter")}</button>
        <Link href="/admin/bookings" className="btn btn-ghost !min-h-10 text-sm">{t("bk.reset")}</Link>
      </form>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100">
        <table className="w-full min-w-[60rem] text-left text-sm" data-testid="bookings-table">
          <thead className="bg-mist text-xs uppercase tracking-wide text-ink-500">
            <tr>{heads.map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{t(`bk.col.${h}`)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-ink-500">{t("bk.none")}</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-mist/60">
                <td className="px-3 py-2.5 font-mono font-semibold"><Link href={`/admin/bookings/${b.code}`} className="text-sea-800 hover:underline">{b.code}</Link></td>
                <td className="px-3 py-2.5">{b.guest ? `${b.guest.firstName} ${b.guest.lastName}` : "—"}<div className="text-xs text-ink-500">{b.guest?.phone}</div></td>
                <td className="whitespace-nowrap px-3 py-2.5">{b.checkIn.toISOString().slice(0, 10)} → {b.checkOut.toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2.5">{b.rooms.map((r) => `${r.room.number} · ${tr(r.room.roomType.name, user.adminLocale)}`).join(", ") || "—"}</td>
                <td className="px-3 py-2.5"><StatusChip status={b.status} label={t(`bk.status.${b.status}`)} /></td>
                <td className="px-3 py-2.5 text-xs">{t(`bk.pay.${b.paymentStatus}`)}{b.paymentPlan && <div className="text-ink-500">{t(`bk.plan.${b.paymentPlan}`)}</div>}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{money(b.grandTotal)}<div className="text-xs text-ink-500">{t("bk.paid")} {money(b.amountPaid)}</div></td>
                <td className="px-3 py-2.5 text-xs">{t(`bk.sources.${b.source}`)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-500">{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminFrame>
  );
}

export default function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><List searchParams={searchParams} /></Suspense>;
}
