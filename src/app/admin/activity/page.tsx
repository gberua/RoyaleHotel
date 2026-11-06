import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { AdminFrame } from "@/components/admin/AdminFrame";

export const metadata: Metadata = { title: "Activity log" };
const show = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Who did what and when — with old → new values for prices, rooms, settings and bookings. */
async function Activity({ searchParams }: { searchParams: PageProps<"/admin/activity">["searchParams"] }) {
  await connection();
  const user = await requirePermission("activity");
  const t = await adminT(user.adminLocale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const rows = await db.activityLog.findMany({
    where: q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { user: { name: { contains: q, mode: "insensitive" } } }] } : {},
    orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true } } },
  });
  const codes = new Map((await db.booking.findMany({ where: { id: { in: rows.filter((r) => r.entity === "Booking" && r.entityId).map((r) => r.entityId!) } }, select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  return (
    <AdminFrame user={user} title={t("nav.activity")}>
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder={t("act.search")} className="field !min-h-10 !py-1.5 text-sm sm:max-w-sm" /><button className="btn btn-ghost !min-h-10 text-sm">{t("common.search")}</button></form>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="bg-mist text-xs uppercase tracking-wide text-ink-500"><tr>{["when", "who", "action", "details"].map((h) => <th key={h} className="px-3 py-2.5">{t(`act.${h}`)}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => {
              const before = (r.before ?? {}) as Record<string, unknown>, after = (r.after ?? {}) as Record<string, unknown>;
              const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].slice(0, 12);
              const code = r.entity === "Booking" && r.entityId ? codes.get(r.entityId) : undefined;
              return (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-500">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC</td>
                  <td className="px-3 py-2">{r.user?.name ?? <span className="text-ink-500">{t("bk.guestOrSystem")}</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-3 py-2">
                    {code && !code.startsWith("HOLD-") ? <Link href={`/admin/bookings/${code}`} className="text-sea-700 hover:underline">{r.summary}</Link> : r.summary}
                    {r.ip && <span className="ml-2 text-xs text-ink-300">{r.ip}</span>}
                    {keys.length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-sea-700">{t("act.changes", { count: keys.length })}</summary>
                        <ul className="mt-1 space-y-0.5 font-mono">
                          {keys.map((k) => <li key={k} className="break-all"><span className="text-ink-500">{k}:</span> <span className="text-red-800 line-through decoration-red-300">{show(before[k]).slice(0, 200)}</span> → <span className="text-emerald-800">{show(after[k]).slice(0, 200)}</span></li>)}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminFrame>
  );
}

export default function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Activity searchParams={searchParams} /></Suspense>;
}
