import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { tr } from "@/lib/i18n-content";
import { SITE_URL } from "@/lib/site-url";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminForm, ConfirmSubmit } from "@/components/admin/ui";
import { stampInGeorgia } from "@/lib/booking/dates";
import { adminAddFeed, adminRemoveFeed, adminSyncFeed } from "../booking-actions";

export const metadata: Metadata = { title: "Channels" };
const CHANNELS: Record<string, string> = { booking_com: "Booking.com", airbnb: "Airbnb", expedia: "Expedia", other: "Other" };

async function Channels() {
  await connection();
  const user = await requirePermission("channels");
  const t = await adminT(user.adminLocale);
  const [types, feeds] = await Promise.all([
    db.roomType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { rooms: true } } } }),
    db.icalFeed.findMany({ where: { active: true }, orderBy: { channel: "asc" } }),
  ]);
  const f = "field !min-h-10 !py-1.5 text-sm";
  const name = (c: string) => (c === "other" ? t("ch.other") : CHANNELS[c] ?? c);
  return (
    <AdminFrame user={user} title={t("ch.title")}>
      <p className="mb-5 max-w-3xl text-sm text-ink-700">{t("ch.intro")}</p>
      <div className="space-y-4">
        {types.map((rt) => {
          const list = feeds.filter((x) => x.roomTypeId === rt.id);
          return (
            <section key={rt.id} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <h2 className="font-semibold">{tr(rt.name, user.adminLocale)} <span className="text-sm font-normal text-ink-500">· {t("rooms.roomsCount", { count: rt._count.rooms })}</span></h2>
              <ul className="mt-3 space-y-3">
                {list.length === 0 && <li className="text-sm text-ink-500">{t("ch.none")}</li>}
                {list.map((fd) => (
                  <li key={fd.id} className="rounded-xl bg-mist p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{name(fd.channel)}</strong>
                      <div className="flex gap-2">
                        {fd.importUrl && <form action={adminSyncFeed}><input type="hidden" name="id" value={fd.id} /><button className="btn btn-ghost !min-h-8 !px-3 text-xs">{t("ch.syncNow")}</button></form>}
                        <ConfirmSubmit action={adminRemoveFeed} id={fd.id} label={t("ch.remove")} confirm={t("ch.removeConfirm")} />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">{t("ch.exportUrl", { channel: name(fd.channel) })}</p>
                    <code className="block break-all rounded bg-white p-2 text-xs" data-testid="export-url">{`${SITE_URL}/api/ical/${fd.exportToken}.ics`}</code>
                    {fd.importUrl ? <p className="mt-2 break-all text-xs text-ink-500">{t("ch.import")}: {fd.importUrl}</p> : <p className="mt-2 text-xs text-ink-500">{t("ch.exportOnly")}</p>}
                    <p className="mt-1 text-xs">{fd.lastSyncAt ? t("ch.lastSync", { at: stampInGeorgia(fd.lastSyncAt), count: fd.lastCount ?? 0 }) : t("ch.never")}</p>
                    {fd.lastError && <p className="mt-1 rounded bg-red-50 p-2 text-xs text-red-800">⚠️ {fd.lastError}</p>}
                  </li>
                ))}
              </ul>
              <AdminForm action={adminAddFeed} submit={t("ch.connect")} tone="ghost" className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="roomTypeId" value={rt.id} />
                <label className="text-xs text-ink-500">{t("ch.channel")}<select name="channel" className={`${f} mt-1 !w-auto`}>{Object.keys(CHANNELS).map((k) => <option key={k} value={k}>{name(k)}</option>)}</select></label>
                <label className="min-w-64 flex-1 text-xs text-ink-500">{t("ch.theirUrl")}<input name="importUrl" type="url" placeholder="https://admin.booking.com/hotel/hoteladmin/ical.html?t=…" className={`${f} mt-1`} /></label>
              </AdminForm>
            </section>
          );
        })}
      </div>
    </AdminFrame>
  );
}

export default function ChannelsPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Channels /></Suspense>;
}
