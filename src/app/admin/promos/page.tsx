import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { toIso } from "@/lib/booking/dates";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, SelectInput, TextInput, Toggle } from "@/components/admin/ui";
import { deletePromo, savePromo, setPromoActive } from "../pricing-actions";

export const metadata: Metadata = { title: "Promo codes" };
const d = (v: Date | null) => (v ? toIso(v) : "");
const COUNTED = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW"] as const;

async function Promos() {
  await connection();
  const user = await requirePermission("prices");
  const t = await adminT(user.adminLocale);
  const L = user.adminLocale;
  const [promos, types, stats] = await Promise.all([
    db.promoCode.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    db.roomType.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.booking.groupBy({ by: ["promoCodeId"], where: { promoCodeId: { not: null }, status: { in: [...COUNTED] } }, _count: true, _sum: { grandTotal: true, discountTotal: true } }),
  ]);
  const statOf = new Map(stats.map((s) => [s.promoCodeId, s]));
  const money = (n: number) => formatMoney(n, undefined, "en");

  const form = (p?: (typeof promos)[number]) => (
    <AdminForm action={savePromo} submit={p ? t("common.save") : t("common.add")} resetOnSuccess={!p} tone={p ? "ghost" : "primary"} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[10rem_9rem_7rem_1fr]">
        <TextInput label={t("promos.code")} name="code" defaultValue={p?.code} required placeholder="SUMMER10" />
        <SelectInput label={t("promos.type")} name="type" defaultValue={p?.type ?? "PERCENT"} options={[{ value: "PERCENT", label: t("promos.percent") }, { value: "FIXED", label: t("promos.fixed") }]} />
        <TextInput label={t("promos.value")} name="value" defaultValue={p ? (p.type === "PERCENT" ? p.value : p.value / 100) : ""} inputMode="decimal" required />
        <TextInput label={t("promos.note")} name="description" defaultValue={p?.description} className="col-span-2 sm:col-span-1" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextInput label={t("promos.bookFrom")} name="validFrom" type="date" defaultValue={d(p?.validFrom ?? null)} />
        <TextInput label={t("promos.bookTo")} name="validTo" type="date" defaultValue={d(p?.validTo ?? null)} />
        <TextInput label={t("promos.stayFrom")} name="stayFrom" type="date" defaultValue={d(p?.stayFrom ?? null)} />
        <TextInput label={t("promos.stayTo")} name="stayTo" type="date" defaultValue={d(p?.stayTo ?? null)} />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:max-w-lg">
        <TextInput label={t("promos.minNights")} name="minNights" defaultValue={p?.minNights} inputMode="numeric" />
        <TextInput label={t("promos.maxUses")} name="maxUses" defaultValue={p?.maxUses} inputMode="numeric" />
        <TextInput label={t("promos.perGuest")} name="perGuestLimit" defaultValue={p?.perGuestLimit} inputMode="numeric" />
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-700">{t("promos.roomTypes")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {types.map((rt) => <label key={rt.id} className="flex items-center gap-2"><input type="checkbox" name="roomTypeId" value={rt.id} defaultChecked={p?.roomTypeIds.includes(rt.id)} className="h-4 w-4 accent-sea-700" />{tr(rt.name, L)}</label>)}
        </div>
        <p className="mt-1 text-xs text-ink-500">{t("promos.allTypesHint")}</p>
      </fieldset>
      <Toggle name="active" label={t("common.active")} defaultChecked={p?.active ?? true} />
    </AdminForm>
  );

  return (
    <AdminFrame user={user} title={t("promos.title")}>
      <p className="mb-4 max-w-3xl text-sm text-ink-700">{t("promos.hint")}</p>
      <div className="space-y-4">
        {promos.map((p) => {
          const s = statOf.get(p.id);
          return (
            <Card key={p.id} title={`${p.code} · ${p.type === "PERCENT" ? `${p.value}%` : money(p.value)}`} actions={
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.active ? "bg-sea-100 text-sea-800" : "bg-ink-100 text-ink-700"}`}>{p.active ? t("common.active") : t("common.inactive")}</span>
                <span data-testid="promo-usage">{t("promos.usage", { count: s?._count ?? 0, max: p.maxUses ?? "∞" })} · {t("promos.revenue", { amount: money(s?._sum.grandTotal ?? 0) })} · {t("promos.discountGiven", { amount: money(s?._sum.discountTotal ?? 0) })}</span>
              </div>
            }>
              <details><summary className="cursor-pointer text-sm font-semibold text-sea-700">{t("common.edit")}</summary><div className="mt-3">{form(p)}</div></details>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                <ActionButton action={setPromoActive} fields={{ id: p.id, active: String(!p.active) }} label={p.active ? t("promos.deactivate") : t("promos.activate")} />
                {!s && <ActionButton action={deletePromo} fields={{ id: p.id }} label={t("common.delete")} tone="danger" confirm={t("promos.deleteConfirm")} />}
              </div>
            </Card>
          );
        })}
        <Card title={t("promos.add")}>{form()}</Card>
      </div>
    </AdminFrame>
  );
}

export default function PromosPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Promos /></Suspense>;
}
