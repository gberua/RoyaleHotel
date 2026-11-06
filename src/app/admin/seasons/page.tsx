import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { toIso } from "@/lib/booking/dates";
import { seasonOverlaps } from "@/lib/booking/rates";
import { tr } from "@/lib/i18n-content";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, LocalizedInput, TextInput } from "@/components/admin/ui";
import { deleteSeason, saveSeason } from "../pricing-actions";

export const metadata: Metadata = { title: "Seasons" };
const gel = (n: number | null | undefined) => (n == null ? "" : String(n / 100));

async function Seasons() {
  await connection();
  const user = await requirePermission("prices");
  const t = await adminT(user.adminLocale);
  const L = user.adminLocale;
  const [seasons, types] = await Promise.all([
    db.season.findMany({ orderBy: { startDate: "asc" }, include: { rates: true } }),
    db.roomType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, basePrice: true, weekendPrice: true } }),
  ]);
  const overlaps = seasonOverlaps(seasons.map((s) => ({ id: s.id, name: tr(s.name, L), startDate: toIso(s.startDate), endDate: toIso(s.endDate) })));
  const nameOf = new Map(seasons.map((s) => [s.id, tr(s.name, L)]));

  const form = (s?: (typeof seasons)[number]) => (
    <AdminForm action={saveSeason} submit={s ? t("common.save") : t("common.add")} resetOnSuccess={!s} className="space-y-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_5rem]">
        <LocalizedInput label={t("seasons.name")} name="name" value={s?.name as Record<string, string>} required />
        <TextInput label={t("common.from")} name="startDate" type="date" defaultValue={s && toIso(s.startDate)} required />
        <TextInput label={t("seasons.toIncl")} name="endDate" type="date" defaultValue={s && toIso(s.endDate)} required />
        <label className="text-xs font-medium text-ink-700"><span className="mb-1 block">{t("seasons.color")}</span><input type="color" name="color" defaultValue={s?.color ?? "#14b8c4"} className="h-10 w-full cursor-pointer rounded-lg border border-ink-100" /></label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead><tr className="text-left text-xs text-ink-500"><th className="py-1">{t("seasons.roomType")}</th><th>{t("seasons.price")}</th><th>{t("seasons.weekend")}</th><th>{t("seasons.minStay")}</th></tr></thead>
          <tbody>
            {types.map((rt) => {
              const r = s?.rates.find((x) => x.roomTypeId === rt.id);
              return (
                <tr key={rt.id} className="border-t border-ink-100">
                  <td className="py-1.5 pr-2">{tr(rt.name, L)}<span className="block text-xs text-ink-500">{t("seasons.baseIs", { price: gel(rt.basePrice) })}</span></td>
                  <td className="pr-2"><input name={`price.${rt.id}`} defaultValue={gel(r?.price)} inputMode="decimal" placeholder={gel(rt.basePrice)} className="field !min-h-9 !py-1 text-sm" /></td>
                  <td className="pr-2"><input name={`weekendPrice.${rt.id}`} defaultValue={gel(r?.weekendPrice)} inputMode="decimal" className="field !min-h-9 !py-1 text-sm" /></td>
                  <td><input name={`minStay.${rt.id}`} defaultValue={r?.minStay ?? ""} inputMode="numeric" className="field !min-h-9 !w-20 !py-1 text-sm" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500">{t("seasons.emptyHint")}</p>
    </AdminForm>
  );

  return (
    <AdminFrame user={user} title={t("seasons.title")}>
      <p className="mb-4 max-w-3xl text-sm text-ink-700">{t("seasons.hint")}</p>
      {overlaps.length > 0 && (
        <div role="alert" className="mb-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle size={18} className="shrink-0" aria-hidden />
          <div>{t("seasons.overlap")}<ul className="mt-1 list-disc pl-5">{overlaps.map((o) => <li key={o.a + o.b}>{nameOf.get(o.a)} ↔ {nameOf.get(o.b)}</li>)}</ul></div>
        </div>
      )}
      <div className="space-y-4">
        {seasons.map((s) => (
          <Card key={s.id} title={`${tr(s.name, L)} · ${toIso(s.startDate)} → ${toIso(s.endDate)}`} actions={<ActionButton action={deleteSeason} fields={{ id: s.id }} label={t("common.delete")} tone="danger" confirm={t("seasons.deleteConfirm")} />}>
            <div className="mb-3 h-1.5 w-full rounded" style={{ background: s.color ?? "#14b8c4" }} />
            {form(s)}
          </Card>
        ))}
        <Card title={t("seasons.add")}>{form()}</Card>
      </div>
    </AdminFrame>
  );
}

export default function SeasonsPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Seasons /></Suspense>;
}
