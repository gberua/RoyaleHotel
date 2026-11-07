import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { loadSettings } from "@/lib/booking/service";
import { automaticEmailStats } from "@/lib/notify/automatic";
import { PLACEHOLDERS, TEMPLATE_KEYS, fill, loadTemplate, templateVars } from "@/lib/notify/templates";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminForm, Card, Field, TextInput, Toggle } from "@/components/admin/ui";
import { saveAutomation, saveTemplate, sendTestTemplate } from "./actions";

export const metadata: Metadata = { title: "E-mails & messages" };
const LOCALES = ["ka", "en", "ru"] as const;

async function Emails() {
  await connection();
  const user = await requirePermission("content");
  const t = await adminT(user.adminLocale);
  const settings = await loadSettings();
  const a = settings.automation;
  const sample = (await db.booking.findFirst({ where: { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } }, orderBy: { createdAt: "desc" }, include: { guest: { select: { firstName: true } } } }))
    ?? { code: "RH-2027-0001", checkIn: new Date("2027-07-10"), checkOut: new Date("2027-07-13"), guest: { firstName: "Nino" } };
  const templates = await Promise.all(TEMPLATE_KEYS.map(async (key) => ({ key, byLocale: await Promise.all(LOCALES.map(async (l) => ({ l, tpl: await loadTemplate(key, l) }))) })));
  const { sent7, upcoming: queued } = await automaticEmailStats();

  return (
    <AdminFrame user={user} title={t("em.title")}>
      <div className="space-y-5">
        <Card title={t("em.auto")}>
          <p className="-mt-2 mb-3 text-xs text-ink-500">{t("em.autoHint", { sent: sent7, upcoming: queued })}</p>
          <AdminForm action={saveAutomation} submit={t("common.save")} className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-mist p-3"><Toggle name="preArrivalEnabled" label={t("em.preArrival")} defaultChecked={a.preArrivalEnabled} hint={t("em.preArrivalHint")} /><TextInput label={t("em.daysBefore")} name="preArrivalDays" defaultValue={a.preArrivalDays} inputMode="numeric" /></div>
            <div className="rounded-xl bg-mist p-3"><Toggle name="postStayEnabled" label={t("em.postStay")} defaultChecked={a.postStayEnabled} hint={t("em.postStayHint")} /><TextInput label={t("em.daysAfter")} name="postStayDays" defaultValue={a.postStayDays} inputMode="numeric" /></div>
          </AdminForm>
          {!process.env.RESEND_API_KEY && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-950">{t("em.noResend")}</p>}
        </Card>

        <Card title={t("em.placeholders")}>
          <p className="text-xs text-ink-700">{t("em.placeholdersHint")}</p>
          <p className="mt-2 flex flex-wrap gap-1.5">{PLACEHOLDERS.map((p) => <code key={p} className="rounded bg-mist px-1.5 py-0.5 text-xs">{`{{${p}}}`}</code>)}</p>
        </Card>

        {templates.map(({ key, byLocale }) => (
          <Card key={key} title={t(`em.tpl.${key}`)}>
            <p className="-mt-2 mb-3 text-xs text-ink-500">{t(`em.tplHint.${key}`)}</p>
            <div className="space-y-2">
              {byLocale.map(({ l, tpl }) => {
                const vars = templateVars({ ...sample, locale: l }, settings);
                return (
                  <details key={l} open={l === user.adminLocale} className="rounded-xl ring-1 ring-ink-100">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold">{t(`langs.${l}`)} {tpl.custom ? <span className="rounded-full bg-sea-100 px-2 text-xs text-sea-800">{t("em.custom")}</span> : <span className="rounded-full bg-ink-100 px-2 text-xs text-ink-700">{t("em.builtIn")}</span>}</summary>
                    <div className="grid gap-4 border-t border-ink-100 p-3 lg:grid-cols-2">
                      <AdminForm action={saveTemplate} submit={t("common.save")} className="space-y-2">
                        <input type="hidden" name="key" value={key} /><input type="hidden" name="locale" value={l} />
                        {key !== "whatsapp" && <TextInput label={t("em.subject")} name="subject" defaultValue={tpl.subject} />}
                        <Field label={t("em.body")} name="body" hint={t("em.bodyHint")}>
                          <textarea name="body" defaultValue={tpl.body} rows={key === "whatsapp" ? 4 : 12} lang={l} className="field resize-y text-sm" />
                        </Field>
                      </AdminForm>
                      <div>
                        <p className="mb-1 text-xs font-medium text-ink-700">{t("em.preview")}</p>
                        <div className="rounded-xl bg-mist p-3 text-sm" lang={l} data-testid={`preview-${key}-${l}`}>
                          {key !== "whatsapp" && <p className="mb-2 font-semibold">{fill(tpl.subject, vars)}</p>}
                          <p className="whitespace-pre-wrap text-ink-700">{fill(tpl.body, vars)}</p>
                        </div>
                        {key !== "whatsapp" && (
                          <AdminForm action={sendTestTemplate} submit={t("em.sendTest", { email: user.email })} tone="ghost" className="mt-2">
                            <input type="hidden" name="key" value={key} /><input type="hidden" name="locale" value={l} />
                          </AdminForm>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </AdminFrame>
  );
}

export default function EmailsPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Emails /></Suspense>;
}
