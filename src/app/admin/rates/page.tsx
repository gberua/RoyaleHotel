import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { addDaysIso, isIsoDate, todayInGeorgia } from "@/lib/booking/dates";
import { loadRateContext } from "@/lib/booking/service";
import { rateGrid } from "@/lib/booking/rates";
import { tr } from "@/lib/i18n-content";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { RateGrid } from "@/components/admin/RateGrid";

export const metadata: Metadata = { title: "Rate calendar" };
const SEASON_COLORS = ["#e0f7f9", "#fdf3d8", "#e8f0fe", "#fde8e4", "#eaf7e8", "#f3e8fd"];

async function Rates({ searchParams }: { searchParams: PageProps<"/admin/rates">["searchParams"] }) {
  await connection();
  const user = await requirePermission("prices");
  const t = await adminT(user.adminLocale);
  const sp = await searchParams;
  const days = 35;
  const start = typeof sp.start === "string" && isIsoDate(sp.start) ? sp.start : todayInGeorgia();
  const ctx = await loadRateContext(start, addDaysIso(start, days));
  const [names, seasonRows] = await Promise.all([
    db.roomType.findMany({ where: { id: { in: ctx.types.map((x) => x.id) } }, select: { id: true, name: true } }),
    db.season.findMany({ orderBy: { startDate: "asc" } }),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, tr(n.name, user.adminLocale)]));
  const dates = Array.from({ length: days }, (_, i) => addDaysIso(start, i));
  const grid = Object.fromEntries(ctx.types.map((rt) => [rt.id, rateGrid(rt, ctx.seasons, ctx.overrides, start, days)]));
  const seasons = seasonRows.filter((s) => ctx.seasons.some((c) => c.id === s.id)).map((s) => ({ id: s.id, name: tr(s.name, user.adminLocale), color: s.color && s.color.startsWith("#") && s.color.length === 7 ? `${s.color}33` : SEASON_COLORS[seasonRows.indexOf(s) % SEASON_COLORS.length] }));
  const link = (s: string) => `/admin/rates?start=${s}`;
  return (
    <AdminFrame user={user} title={t("rates.title")} wide actions={
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={link(addDaysIso(start, -28))} className="btn btn-ghost !min-h-9 !px-3" aria-label={t("rates.prev")}><ChevronLeft size={16} /></Link>
        <Link href={link(todayInGeorgia())} className="btn btn-ghost !min-h-9 !px-3">{t("rates.today")}</Link>
        <Link href={link(addDaysIso(start, 28))} className="btn btn-ghost !min-h-9 !px-3" aria-label={t("rates.next")}><ChevronRight size={16} /></Link>
        <form className="flex gap-1"><input type="date" name="start" defaultValue={start} className="field !min-h-9 !w-auto !py-1 text-sm" /><button className="btn btn-ghost !min-h-9 !px-3">→</button></form>
      </div>
    }>
      <p className="mb-3 max-w-3xl text-sm text-ink-700">{t("rates.hint")}</p>
      <RateGrid types={ctx.types.map((x) => ({ id: x.id, name: nameOf.get(x.id) ?? x.slug }))} dates={dates} grid={grid} seasons={seasons} />
    </AdminFrame>
  );
}

export default function RatesPage({ searchParams }: PageProps<"/admin/rates">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Rates searchParams={searchParams} /></Suspense>;
}
