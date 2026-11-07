"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, BedDouble, Check, CheckCheck, Loader2, LogIn, LogOut, Sparkles, Wrench } from "lucide-react";
import { setHousekeeping } from "@/app/admin/housekeeping/actions";
import { useErrorText } from "./ui";

export type HkRoom = {
  id: string; number: string; floor: number | null; type: string; status: "CLEAN" | "DIRTY" | "INSPECTED" | "OUT_OF_ORDER";
  note: string | null; changedAt: string | null; changedBy: string | null;
  arriving: { guest: string; time: string | null; guests: string } | null;
  departing: { guest: string } | null; staying: boolean; blocked: string | null;
};

const TONE: Record<HkRoom["status"], string> = {
  DIRTY: "bg-amber-50 ring-amber-300", CLEAN: "bg-emerald-50 ring-emerald-300", INSPECTED: "bg-sea-50 ring-sea-400", OUT_OF_ORDER: "bg-red-50 ring-red-300",
};
const DOT: Record<HkRoom["status"], string> = { DIRTY: "bg-amber-500", CLEAN: "bg-emerald-500", INSPECTED: "bg-sea-500", OUT_OF_ORDER: "bg-red-500" };

/** Big, one-tap room cards for phones, grouped by floor. */
export function HousekeepingBoard({ rooms, canUpdate, canInspect }: { rooms: HkRoom[]; canUpdate: boolean; canInspect: boolean }) {
  const t = useTranslations("admin.hk");
  const errText = useErrorText();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "todo">("todo");
  const [, start] = useTransition();
  const set = (roomId: string, status: HkRoom["status"]) => {
    setBusy(roomId + status); setErr(null);
    start(async () => {
      const fd = new FormData(); fd.set("roomId", roomId); fd.set("status", status);
      const r = await setHousekeeping({ ok: true }, fd);
      if (!r.ok) setErr(errText(r.error, r.values));
      setBusy(null); router.refresh();
    });
  };
  const todo = (r: HkRoom) => r.status === "DIRTY" || (!!r.arriving && r.status !== "INSPECTED" && r.status !== "OUT_OF_ORDER");
  const shown = filter === "todo" ? rooms.filter(todo) : rooms;
  const floors = [...new Set(shown.map((r) => r.floor ?? 0))].sort((a, b) => a - b);
  const count = (s: HkRoom["status"]) => rooms.filter((r) => r.status === s).length;
  const btn = "flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold disabled:opacity-40";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {(["DIRTY", "CLEAN", "INSPECTED", "OUT_OF_ORDER"] as const).map((s) => (
          <div key={s} className={`rounded-xl p-2 ring-1 ${TONE[s]}`}><p className="text-xl font-bold tabular-nums">{count(s)}</p><p className="leading-tight">{t(`s.${s}`)}</p></div>
        ))}
      </div>
      <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-ink-100">
        {(["todo", "all"] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${filter === f ? "bg-ink-900 text-white" : "text-ink-700"}`}>{t(`filter.${f}`)}</button>)}
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-danger">{err}</p>}
      {shown.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-ink-700 ring-1 ring-ink-100"><CheckCheck className="mx-auto mb-2 text-emerald-600" />{t("allDone")}</p>}
      {floors.map((f) => (
        <section key={f}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{f ? t("floor", { n: f }) : t("noFloor")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.filter((r) => (r.floor ?? 0) === f).map((r) => (
              <li key={r.id} className={`rounded-2xl p-4 ring-2 ${TONE[r.status]}`} data-testid={`hk-${r.number}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-sans text-2xl font-bold leading-none">{r.number}</p>
                    <p className="mt-1 text-xs text-ink-700">{r.type}</p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${DOT[r.status]}`} />{t(`s.${r.status}`)}</span>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {r.arriving && <p className="flex items-center gap-1.5 font-semibold text-sea-800"><LogIn size={15} aria-hidden />{t("arriving", { guest: r.arriving.guest, guests: r.arriving.guests })}{r.arriving.time ? ` · ${r.arriving.time}` : ""}</p>}
                  {r.departing && <p className="flex items-center gap-1.5 text-ink-700"><LogOut size={15} aria-hidden />{t("departing", { guest: r.departing.guest })}</p>}
                  {!r.departing && r.staying && <p className="flex items-center gap-1.5 text-ink-700"><BedDouble size={15} aria-hidden />{t("occupied")}</p>}
                  {r.blocked && <p className="flex items-center gap-1.5 text-red-800"><Wrench size={15} aria-hidden />{r.blocked}</p>}
                  {r.arriving && r.status === "DIRTY" && <p className="flex items-center gap-1.5 font-semibold text-amber-900"><AlertTriangle size={15} aria-hidden />{t("priority")}</p>}
                  {r.note && <p className="rounded-lg bg-white/70 px-2 py-1 text-xs">{r.note}</p>}
                  {r.changedAt && <p className="text-xs text-ink-500">{t("changed", { by: r.changedBy ?? "—", at: r.changedAt })}</p>}
                </div>
                {canUpdate && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === "DIRTY" && <button type="button" disabled={!!busy} onClick={() => set(r.id, "CLEAN")} className={`${btn} bg-emerald-600 text-white`}>{busy === r.id + "CLEAN" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{t("markClean")}</button>}
                    {canInspect && r.status === "CLEAN" && <button type="button" disabled={!!busy} onClick={() => set(r.id, "INSPECTED")} className={`${btn} bg-sea-600 text-ink-950`}>{busy === r.id + "INSPECTED" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{t("markInspected")}</button>}
                    {(r.status === "CLEAN" || r.status === "INSPECTED") && <button type="button" disabled={!!busy} onClick={() => set(r.id, "DIRTY")} className={`${btn} bg-white text-ink-900 ring-1 ring-ink-100`}>{t("markDirty")}</button>}
                    {canInspect && r.status !== "OUT_OF_ORDER" && <button type="button" disabled={!!busy} onClick={() => set(r.id, "OUT_OF_ORDER")} className={`${btn} flex-none bg-white text-red-800 ring-1 ring-red-200`} aria-label={t("markOoo")}><Wrench size={16} /></button>}
                    {canInspect && r.status === "OUT_OF_ORDER" && <button type="button" disabled={!!busy} onClick={() => set(r.id, "DIRTY")} className={`${btn} bg-white text-ink-900 ring-1 ring-ink-100`}>{t("backInService")}</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
