import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { tr } from "@/lib/i18n-content";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, LocalizedInput, SelectInput, TextInput, Toggle } from "@/components/admin/ui";
import { SortableList } from "@/components/admin/Sortable";
import { deleteExtra, deleteOccupancyRule, moveExtras, saveExtra, saveOccupancyRule } from "../pricing-actions";

export const metadata: Metadata = { title: "Extras & children" };
const gel = (n: number | null | undefined) => (n == null ? "" : String(n / 100));
const UNITS = ["PER_STAY", "PER_NIGHT", "PER_GUEST", "PER_GUEST_NIGHT"] as const;

async function Extras() {
  await connection();
  const user = await requirePermission("prices");
  const t = await adminT(user.adminLocale);
  const L = user.adminLocale;
  const [extras, rules] = await Promise.all([
    db.extra.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { bookings: true } } } }),
    db.occupancyRule.findMany({ orderBy: [{ kind: "asc" }, { minAge: "asc" }, { sortOrder: "asc" }] }),
  ]);
  const unitOptions = UNITS.map((u) => ({ value: u, label: t(`extras.units.${u}`) }));
  const kindOptions = ["child", "extra_adult", "extra_bed"].map((k) => ({ value: k, label: t(`extras.kinds.${k}`) }));
  const modeOptions = [{ value: "fixed", label: t("extras.modeFixed") }, { value: "percent", label: t("extras.modePercent") }];

  const extraForm = (x?: (typeof extras)[number]) => (
    <AdminForm action={saveExtra} submit={x ? t("common.save") : t("common.add")} resetOnSuccess={!x} tone={x ? "ghost" : "primary"} className="space-y-3">
      {x && <input type="hidden" name="id" value={x.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <LocalizedInput label={t("extras.name")} name="name" value={x?.name as Record<string, string>} required />
        <LocalizedInput label={t("extras.description")} name="description" value={x?.description as Record<string, string>} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_1fr_8rem]">
        <TextInput label={t("extras.price")} name="price" defaultValue={gel(x?.price)} inputMode="decimal" required />
        <SelectInput label={t("extras.unit")} name="unit" defaultValue={x?.unit ?? "PER_STAY"} options={unitOptions} />
        <TextInput label={t("extras.icon")} name="icon" defaultValue={x?.icon} placeholder="Coffee" hint={t("extras.iconHint")} />
      </div>
      <Toggle name="active" label={t("common.active")} defaultChecked={x?.active ?? true} />
    </AdminForm>
  );

  const ruleForm = (r?: (typeof rules)[number]) => (
    <AdminForm action={saveOccupancyRule} submit={r ? t("common.save") : t("common.add")} resetOnSuccess={!r} tone={r ? "ghost" : "primary"} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.6fr_9rem_5rem_5rem_9rem_6rem_6rem]">
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="col-span-2 sm:col-span-1"><LocalizedInput label={t("extras.ruleName")} name="name" value={r?.name as Record<string, string>} required /></div>
      <SelectInput label={t("extras.kind")} name="kind" defaultValue={r?.kind ?? "child"} options={kindOptions} />
      <TextInput label={t("extras.minAge")} name="minAge" defaultValue={r?.minAge} inputMode="numeric" />
      <TextInput label={t("extras.maxAge")} name="maxAge" defaultValue={r?.maxAge} inputMode="numeric" />
      <SelectInput label={t("extras.mode")} name="mode" defaultValue={r?.percentOfRoom != null ? "percent" : "fixed"} options={modeOptions} />
      <TextInput label={t("extras.fixed")} name="pricePerNight" defaultValue={r && r.percentOfRoom == null ? gel(r.pricePerNight) : ""} inputMode="decimal" />
      <TextInput label="%" name="percentOfRoom" defaultValue={r?.percentOfRoom} inputMode="numeric" />
    </AdminForm>
  );

  return (
    <AdminFrame user={user} title={t("extras.title")}>
      <div className="space-y-6">
        <Card title={t("extras.extras")}>
          <p className="mb-3 text-xs text-ink-500">{t("extras.extrasHint")}</p>
          <SortableList action={moveExtras} items={extras.map((x) => ({
            id: x.id,
            node: (
              <details className="rounded-lg">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-1">
                  <span className="font-semibold">{tr(x.name, L)}</span>
                  <span className="text-sm text-ink-700">{gel(x.price)} GEL · {t(`extras.units.${x.unit}`)}</span>
                  {!x.active && <span className="rounded bg-ink-100 px-1.5 text-xs">{t("common.hidden")}</span>}
                  <span className="text-xs text-ink-500">{t("extras.usedIn", { count: x._count.bookings })}</span>
                </summary>
                <div className="mt-2 space-y-2 border-t border-ink-100 pt-3">
                  {extraForm(x)}
                  {x._count.bookings === 0 && <ActionButton action={deleteExtra} fields={{ id: x.id }} label={t("common.delete")} tone="danger" confirm={t("extras.deleteConfirm")} />}
                </div>
              </details>
            ),
          }))} />
          <div className="mt-4 rounded-xl bg-mist p-3"><p className="mb-2 text-sm font-semibold">{t("extras.addExtra")}</p>{extraForm()}</div>
        </Card>

        <Card title={t("extras.guests")}>
          <p className="mb-3 max-w-3xl text-xs text-ink-500">{t("extras.guestsHint")}</p>
          <ul className="space-y-3">
            {rules.map((r) => (
              <li key={r.id} className="rounded-xl p-3 ring-1 ring-ink-100">
                {ruleForm(r)}
                <div className="mt-2 border-t border-ink-100 pt-2"><ActionButton action={deleteOccupancyRule} fields={{ id: r.id }} label={t("common.delete")} tone="danger" confirm={t("extras.deleteRuleConfirm")} /></div>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-mist p-3"><p className="mb-2 text-sm font-semibold">{t("extras.addRule")}</p>{ruleForm()}</div>
        </Card>
      </div>
    </AdminFrame>
  );
}

export default function ExtrasPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Extras /></Suspense>;
}
