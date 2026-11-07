"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, Loader2, Plus } from "lucide-react";
import { applyMove, previewMove } from "@/app/admin/booking-actions";
import type { MovePlan } from "@/lib/booking/service";
import { formatMoney } from "@/lib/money";
import { useErrorText } from "./ui";
import { BAR_COLORS } from "@/lib/admin/calendar-colors";

export type CalRow = { id: string; number: string; typeId: string; typeName: string; header: boolean; hk: string };
export type CalBar = { id: string; roomId: string; s: number; e: number; ci: string; colorKey: string; text: string; title: string; href: string | null; movable: boolean };

const HK: Record<string, string> = { CLEAN: "bg-emerald-500", DIRTY: "bg-amber-500", INSPECTED: "bg-sea-500", OUT_OF_ORDER: "bg-red-500" };
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Drag = { bar: CalBar; x0: number; y0: number; cellW: number; dx: number; roomId: string; moved: boolean };

/** Room × date timeline. Mouse: drag a booking to another room / other dates. Touch: tap to open. Empty cell: new booking. */
export function CalendarGrid({ rows, bars, dates, today, weekend }: { rows: CalRow[]; bars: CalBar[]; dates: string[]; today: string; weekend: string[] }) {
  const t = useTranslations("admin");
  const errText = useErrorText();
  const router = useRouter();
  const days = dates.length;
  const cols = { gridTemplateColumns: `repeat(${days}, minmax(${days === 30 ? 34 : 56}px, 1fr))` };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [plan, setPlan] = useState<{ form: FormData; plan?: MovePlan; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const money = (n: number) => formatMoney(n, undefined, "en");

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current!;
      const dx = e.clientX - d.x0;
      const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-room-row]");
      const next = { ...d, dx, roomId: row?.dataset.roomRow ?? d.roomId, moved: d.moved || Math.abs(dx) > 6 || Math.abs(e.clientY - d.y0) > 6 };
      dragRef.current = next; setDrag(next);
    };
    const up = () => {
      const d = dragRef.current!;
      dragRef.current = null; setDrag(null);
      const shift = Math.round(d.dx / d.cellW);
      if (!d.moved || (shift === 0 && d.roomId === d.bar.roomId)) { if (!d.moved && d.bar.href) router.push(d.bar.href); return; }
      const form = new FormData();
      form.set("allocationId", d.bar.id); form.set("roomId", d.roomId); form.set("checkIn", addDays(d.bar.ci, shift));
      setPlan({ form });
      start(async () => {
        const r = await previewMove({ ok: true }, form);
        setPlan(r.ok ? { form, plan: r.data } : { form, error: errText(r.error, r.values) });
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, router, errText]);

  const begin = (e: React.PointerEvent, bar: CalBar) => {
    if (e.pointerType === "touch" || e.button !== 0 || !bar.movable) return; // touch: plain tap opens the booking
    e.preventDefault();
    const grid = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-room-row]")!;
    const d: Drag = { bar, x0: e.clientX, y0: e.clientY, cellW: grid.getBoundingClientRect().width / days, dx: 0, roomId: bar.roomId, moved: false };
    dragRef.current = d; setDrag(d);
  };
  const confirm = () => start(async () => {
    const r = await applyMove({ ok: true }, plan!.form);
    if (r.ok) { setPlan(null); router.refresh(); } else setPlan({ ...plan!, plan: undefined, error: errText(r.error, r.values) });
  });

  const pos = (s: number, e: number, cut: boolean) => ({ left: `calc(${(Math.max(0, s) / days) * 100}% + ${cut ? 0 : 3}px)`, width: `calc(${((Math.min(days, e) - Math.max(0, s)) / days) * 100}% - ${cut ? 3 : 6}px)` });

  return (
    <>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100" data-testid="timeline">
        <div className="min-w-max select-none">
          <div className="sticky top-0 z-10 flex border-b border-ink-100 bg-white">
            <div className="sticky left-0 z-10 w-40 shrink-0 border-r border-ink-100 bg-white px-3 py-2 text-xs font-semibold text-ink-500">{t("bk.room")}</div>
            <div className="grid flex-1" style={cols}>
              {dates.map((d) => (
                <div key={d} className={`border-r border-ink-100 px-1 py-1.5 text-center text-[0.68rem] leading-tight ${d === today ? "bg-sea-50 font-bold text-sea-900" : weekend.includes(d) ? "bg-mist" : ""}`}>
                  {t(`weekdaysShort.${(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7}`)}<br />{d.slice(8)}.{d.slice(5, 7)}
                </div>
              ))}
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.id}>
              {r.header && <div className="sticky left-0 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{r.typeName}</div>}
              <div className="flex border-b border-ink-100 last:border-0">
                <div className="sticky left-0 z-[5] flex w-40 shrink-0 items-center gap-2 border-r border-ink-100 bg-white px-3 py-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${HK[r.hk]}`} title={t(`cal.hk.${r.hk}`)} />
                  <strong>{r.number}</strong>
                </div>
                <div className={`relative grid flex-1 ${drag && drag.roomId === r.id ? "bg-sea-50/70" : ""}`} style={cols} data-room-row={r.id}>
                  {dates.map((d) => (
                    <Link
                      key={d}
                      href={`/admin/bookings/new?checkIn=${d}&checkOut=${addDays(d, 1)}&roomTypeId=${r.typeId}`}
                      aria-label={`${t("cal.newHere")} ${r.number} ${d}`}
                      className={`group grid h-11 place-items-center border-r border-ink-100 ${d === today ? "bg-sea-50/60" : weekend.includes(d) ? "bg-mist/50" : ""} hover:bg-sea-50`}
                    >
                      <Plus size={13} className="text-sea-700 opacity-0 group-hover:opacity-60" aria-hidden />
                    </Link>
                  ))}
                  {bars.filter((b) => b.roomId === r.id).map((b) => {
                    const cut = b.s < 0;
                    const cls = `absolute inset-y-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2 text-[0.72rem] font-semibold leading-8 shadow-sm ${BAR_COLORS[b.colorKey] ?? "bg-ink-300"} ${cut ? "rounded-l-none" : ""} ${b.movable ? "cursor-grab active:cursor-grabbing" : ""} ${drag?.bar.id === b.id ? "opacity-40" : ""}`;
                    return b.href
                      ? <Link key={b.id} href={b.href} draggable={false} onPointerDown={(e) => begin(e, b)} onClick={(e) => { if (b.movable) e.preventDefault(); }} data-testid="timeline-bar" data-alloc={b.id} className={`${cls} hover:ring-2 hover:ring-ink-900/30 focus-visible:ring-2`} style={pos(b.s, b.e, cut)} title={`${b.title}${b.movable ? ` · ${t("cal.dragHint")}` : ""}`}>{b.text}</Link>
                      : <span key={b.id} className={cls} style={pos(b.s, b.e, cut)} title={b.title}>{b.text}</span>;
                  })}
                  {drag?.moved && drag.roomId === r.id && (() => {
                    const shift = Math.round(drag.dx / drag.cellW);
                    return <span className="pointer-events-none absolute inset-y-1 rounded-md border-2 border-dashed border-ink-900 bg-white/60" style={pos(drag.bar.s + shift, drag.bar.e + shift, false)} aria-hidden />;
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {plan && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="move-title" data-testid="move-dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="move-title" className="font-sans text-lg font-semibold">{t("cal.moveTitle")}</h2>
            {!plan.plan && !plan.error && <p className="mt-4 flex items-center gap-2 text-sm text-ink-700"><Loader2 size={16} className="animate-spin" />{t("cal.checking")}</p>}
            {plan.error && <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900"><AlertTriangle size={16} className="shrink-0" />{plan.error}</p>}
            {plan.plan && (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-ink-500">{t("bk.booking")}</dt><dd className="font-mono font-semibold">{plan.plan.code}</dd></div>
                {plan.plan.rooms.map((m) => <div key={m.allocationId} className="flex justify-between gap-3"><dt className="text-ink-500">{t("bk.room")}</dt><dd className="flex items-center gap-1 font-semibold">{m.from} <ArrowRight size={13} /> {m.to}</dd></div>)}
                {plan.plan.repriced && <div className="flex justify-between gap-3"><dt className="text-ink-500">{t("bk.col.dates")}</dt><dd className="text-right font-semibold">{plan.plan.from.checkIn} → {plan.plan.from.checkOut}<br /><span className="text-sea-800">{plan.plan.to.checkIn} → {plan.plan.to.checkOut}</span></dd></div>}
                <div className="flex justify-between gap-3 border-t border-ink-100 pt-2"><dt className="text-ink-500">{t("bk.col.total")}</dt><dd className="font-semibold tabular-nums">{plan.plan.newTotal === plan.plan.oldTotal ? money(plan.plan.oldTotal) : <>{money(plan.plan.oldTotal)} → <span className="text-sea-800">{money(plan.plan.newTotal)}</span></>}</dd></div>
                <p className="flex gap-1.5 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">✓ {t("cal.available")}</p>
                {plan.plan.outOfOrder.length > 0 && <p className="flex gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-950"><AlertTriangle size={14} className="shrink-0" />{t("cal.oooWarning", { rooms: plan.plan.outOfOrder.join(", ") })}</p>}
              </dl>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost !min-h-10 text-sm" onClick={() => setPlan(null)}>{t("common.cancel")}</button>
              {plan.plan && <button type="button" className="btn btn-primary !min-h-10 text-sm" onClick={confirm} disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}{t("cal.confirmMove")}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
