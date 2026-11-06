import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { settingsSchema } from "@/lib/settings-schema";
import { SETTINGS_SECTIONS, type FieldDef } from "@/lib/admin/settings-fields";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminForm, Card, LocalizedInput, SelectInput, TextInput, Toggle } from "@/components/admin/ui";
import { saveCurrencies, saveSettings, updateFromNbg } from "./actions";

export const metadata: Metadata = { title: "Settings" };

async function SettingsScreen() {
  await connection();
  const user = await requirePermission("settings");
  const t = await adminT(user.adminLocale);
  const [rows, currencies] = await Promise.all([db.setting.findMany(), db.currency.findMany({ orderBy: { sortOrder: "asc" } })]);
  const settings = settingsSchema.parse(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  const label = (k: string) => t(`settings.f.${k}`);
  const hint = (k: string) => (t.has(`settings.h.${k}`) ? t(`settings.h.${k}`) : undefined);

  const field = (f: FieldDef, value: unknown) => {
    const wide = f.wide ? "sm:col-span-2 lg:col-span-3" : "";
    switch (f.kind) {
      case "bool": return <div key={f.key} className={`${wide} self-center`}><Toggle name={f.key} label={label(f.key)} hint={hint(f.key)} defaultChecked={!!value} /></div>;
      case "localized": case "localizedLong": return <div key={f.key} className={wide}><LocalizedInput label={label(f.key)} name={f.key} value={value as Record<string, string>} multiline={f.kind === "localizedLong"} rows={2} hint={hint(f.key)} /></div>;
      case "select": return <SelectInput key={f.key} className={wide} label={label(f.key)} name={f.key} defaultValue={String(value)} hint={hint(f.key)} options={f.options!.map((o) => ({ value: o, label: t(`settings.o.${o}`) }))} />;
      case "list": return <TextInput key={f.key} className={wide} label={label(f.key)} name={f.key} defaultValue={(value as string[]).join(", ")} hint={hint(f.key)} />;
      case "money": return <TextInput key={f.key} className={wide} label={label(f.key)} name={f.key} defaultValue={String((value as number) / 100)} inputMode="decimal" hint={hint(f.key)} />;
      case "int": case "percent": case "decimal": return <TextInput key={f.key} className={wide} label={label(f.key)} name={f.key} defaultValue={value == null ? "" : String(value)} inputMode={f.kind === "decimal" ? "decimal" : "numeric"} hint={hint(f.key)} />;
      default: return <TextInput key={f.key} className={wide} label={label(f.key)} name={f.key} type={f.kind === "text" ? "text" : f.kind} defaultValue={String(value ?? "")} hint={hint(f.key)} />;
    }
  };

  const base = currencies.filter((c) => !c.isBase);
  return (
    <AdminFrame user={user} title={t("settings.title")}>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {[...SETTINGS_SECTIONS.map((s) => s.id), "currency"].map((id) => <a key={id} href={`#${id}`} className="rounded-full bg-white px-3 py-1.5 font-semibold text-ink-700 ring-1 ring-ink-100 hover:bg-mist">{t(`settings.s.${id}`)}</a>)}
      </nav>
      <div className="space-y-5">
        {SETTINGS_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-4">
            <Card title={t(`settings.s.${s.id}`)}>
              <p className="-mt-2 mb-3 text-xs text-ink-500">{t(`settings.sh.${s.id}`)}</p>
              <AdminForm action={saveSettings} submit={t("common.save")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input type="hidden" name="section" value={s.id} />
                {s.fields.map((f) => field(f, (settings[s.group] as Record<string, unknown>)[f.key]))}
              </AdminForm>
            </Card>
          </section>
        ))}
        <section id="currency" className="scroll-mt-4">
          <Card title={t("settings.s.currency")}>
            <p className="-mt-2 mb-3 text-xs text-ink-500">{t("settings.sh.currency")}</p>
            <AdminForm action={saveCurrencies} submit={t("common.save")} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {base.map((c) => (
                  <div key={c.code} className="rounded-xl bg-mist p-3">
                    <TextInput label={t("settings.gelPer", { code: c.code })} name={`gelPer.${c.code}`} defaultValue={(1 / Number(c.rate)).toFixed(4)} inputMode="decimal" />
                    <Toggle name={`enabled.${c.code}`} label={t("settings.showPrices", { code: c.code })} defaultChecked={c.enabled} />
                  </div>
                ))}
              </div>
              <Toggle name="autoUpdate" label={t("settings.autoUpdate")} hint={t("settings.autoUpdateHint")} defaultChecked={settings.currency.autoUpdate} />
              <p className="text-xs text-ink-500">{t("settings.lastUpdated")}: {settings.currency.lastUpdatedAt ? settings.currency.lastUpdatedAt.slice(0, 16).replace("T", " ") + " UTC" : "—"}</p>
            </AdminForm>
            <div className="mt-3 border-t border-ink-100 pt-3"><AdminForm action={updateFromNbg} submit={t("settings.updateNow")} tone="ghost" /></div>
          </Card>
        </section>
      </div>
    </AdminFrame>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><SettingsScreen /></Suspense>;
}
