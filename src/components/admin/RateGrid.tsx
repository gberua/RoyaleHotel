"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ban, Loader2, Lock } from "lucide-react";
import type { GridCell } from "@/lib/booking/rates";
import { applyRates, previewRates, type RatePreview } from "@/app/admin/rates/actions";
import { useErrorText, type ActionResult } from "./ui";

type Props = {
  types: { id: string; name: string }[];
  dates: string[];
  grid: Record<string, GridCell[]>;
  seasons: { id: string; name: string; color: string }[];
};
type Sel = { r1: number; r2: number; c1: number; c2: number } | null;

const gel = (n: number) => (n / 100).toFixed(0);

/** Room types × dates rate grid with drag / tap-tap selection and a bulk-change panel with preview. */
export function RateGrid({ types, dates, grid, seasons }: Props) {
  const t = useTranslations("admin");
  const errText = useErrorText();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [op, setOp] = useState("set");
  const [preview, setPreview] = useState<RatePreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const color = useMemo(() => new Map(seasons.map((s) => [s.id, s.color])), [seasons]);

  const norm = (a: { r: number; c: number }, b: { r: number; c: number }): Sel => ({ r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) });
  const inSel = (r: number, c: number) => !!sel && r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;

  const down = (e: React.PointerEvent, r: number, c: number) => {
    if (e.pointerType === "touch") {
      // tap-tap selection on phones
      if (anchor && !dragging) {
        setSel(norm(anchor, { r, c })); setAnchor(null); setFormKey((k) => k + 1); setPreview(null);
        setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
      else { setAnchor({ r, c }); setSel(norm({ r, c }, { r, c })); }
      return;
    }
    setAnchor({ r, c });
    setDragging(true);
    setSel(norm({ r, c }, { r, c }));
  };
  const enter = (r: number, c: number) => { if (dragging && anchor) setSel(norm(anchor, { r, c })); };
  const up = () => { if (dragging) { setDragging(false); setAnchor(null); setFormKey((k) => k + 1); setPreview(null); } };

  const selTypes = sel ? types.slice(sel.r1, sel.r2 + 1).map((x) => x.id) : [];
  const selFrom = sel ? dates[sel.c1] : "";
  const selTo = sel ? dates[sel.c2] : "";
  const needsValue = ["set", "percent", "amount", "minStay"].includes(op);

  const run = (fn: typeof previewRates | typeof applyRates, isApply: boolean) => start(async () => {
    setMsg(null);
    const fd = new FormData(formRef.current!);
    const res = (await fn({ ok: true }, fd)) as ActionResult & { data?: RatePreview };
    if (!res.ok) { setMsg({ ok: false, text: errText(res.error, res.values) }); setPreview(null); return; }
    if (isApply) { setMsg({ ok: true, text: t("common.saved") }); setPreview(null); setSel(null); router.refresh(); }
    else setPreview(res.data ?? null);
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]" onPointerUp={up} onPointerLeave={up}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-ink-700">
          {seasons.map((s) => <span key={s.id} className="flex items-center gap-1.5"><span className="h-3 w-5 rounded" style={{ background: s.color }} />{s.name}</span>)}
          <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-white ring-1 ring-ink-100" />{t("rates.legendBase")}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded ring-2 ring-ink-900" />{t("rates.legendOverride")}</span>
          <span className="flex items-center gap-1.5"><Ban size={13} className="text-danger" />{t("rates.legendClosed")}</span>
          <span className="flex items-center gap-1.5"><Lock size={13} />{t("rates.legendCta")}</span>
        </div>
        <div className="select-none overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100" data-testid="rate-grid">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-28 bg-white p-2 text-left font-semibold text-ink-500 sm:w-40" />
                {dates.map((d) => {
                  const wd = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
                  return <th key={d} className={`min-w-14 border-l border-ink-100 px-1 py-1.5 text-center font-medium ${wd >= 4 && wd <= 5 ? "bg-mist" : ""}`}>{t(`weekdaysShort.${wd}`)}<br />{d.slice(8)}.{d.slice(5, 7)}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {types.map((rt, r) => (
                <tr key={rt.id} className="border-t border-ink-100">
                  <th className="sticky left-0 z-10 max-w-28 bg-white p-2 text-left text-xs font-semibold leading-tight sm:max-w-40 sm:text-sm">{rt.name}</th>
                  {grid[rt.id].map((cell, c) => (
                    <td
                      key={cell.date}
                      onPointerDown={(e) => down(e, r, c)}
                      onPointerEnter={() => enter(r, c)}
                      className={`relative h-12 cursor-pointer border-l border-ink-100 px-1 text-center align-middle tabular-nums ${inSel(r, c) ? "!bg-sea-200" : ""} ${cell.overridden ? "outline outline-2 -outline-offset-2 outline-ink-900/70" : ""}`}
                      style={{ background: inSel(r, c) ? undefined : cell.seasonId ? color.get(cell.seasonId) : undefined }}
                      title={`${rt.name} · ${cell.date} · ${gel(cell.price)} GEL${cell.closed ? " · closed" : ""}`}
                      data-date={cell.date}
                    >
                      <span className={`block font-semibold ${cell.closed ? "text-danger line-through" : ""}`}>{gel(cell.price)}</span>
                      <span className="flex items-center justify-center gap-0.5 text-[0.62rem] text-ink-500">
                        {cell.minStay > 1 && t("rates.minStayShort", { n: cell.minStay })}
                        {cell.closed && <Ban size={10} className="text-danger" aria-label={t("rates.legendClosed")} />}
                        {cell.cta && <Lock size={10} aria-label={t("rates.legendCta")} />}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside ref={panelRef} className="h-fit scroll-mt-4 rounded-2xl bg-white p-4 ring-1 ring-ink-100 xl:sticky xl:top-4">
        <h2 className="font-sans text-base font-semibold">{t("rates.selection")}</h2>
        {!sel && <p className="mt-1 text-xs text-ink-500">{t("rates.noSelection")}</p>}
        <form key={formKey} ref={formRef} className="mt-3 space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); run(previewRates, false); }} onChange={() => setPreview(null)}>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink-700">{t("rates.roomTypes")}</legend>
            <div className="grid grid-cols-1 gap-0.5">
              {types.map((rt) => (
                <label key={rt.id} className="flex items-center gap-2"><input type="checkbox" name="roomTypeId" value={rt.id} defaultChecked={selTypes.includes(rt.id)} className="h-4 w-4 accent-sea-700" />{rt.name}</label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-ink-700">{t("common.from")}<input type="date" name="from" defaultValue={selFrom} required className="field mt-1 !min-h-10 !py-1.5 text-sm" /></label>
            <label className="text-xs font-medium text-ink-700">{t("common.to")}<input type="date" name="to" defaultValue={selTo} required className="field mt-1 !min-h-10 !py-1.5 text-sm" /></label>
          </div>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink-700">{t("rates.weekdays")}</legend>
            <div className="flex flex-wrap gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((w) => (
                <label key={w} className="flex items-center gap-1 rounded-lg border border-ink-100 px-2 py-1 text-xs has-[:checked]:border-sea-600 has-[:checked]:bg-sea-50"><input type="checkbox" name="weekday" value={w} defaultChecked className="sr-only" />{t(`weekdaysShort.${w}`)}</label>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-medium text-ink-700">{t("rates.change")}
            <select name="op" value={op} onChange={(e) => setOp(e.target.value)} className="field mt-1 !min-h-10 !py-1.5 text-sm">
              {["set", "percent", "amount", "minStay", "close", "open", "closedToArrival", "openToArrival", "clear"].map((o) => <option key={o} value={o}>{t(`rates.ops.${o}`)}</option>)}
            </select>
          </label>
          {needsValue && <label className="block text-xs font-medium text-ink-700">{t("rates.value")}<input name="value" inputMode="decimal" className="field mt-1 !min-h-10 !py-1.5 text-sm" placeholder={op === "percent" ? "15" : op === "amount" ? "-20" : op === "minStay" ? "3" : "250"} /></label>}
          <button className="btn btn-ghost w-full !min-h-10" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}{t("rates.preview")}</button>
        </form>
        {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
        {preview && (
          <div className="mt-3 space-y-2" data-testid="rate-preview">
            <p className="text-sm font-semibold">{t("rates.previewTitle", { count: preview.count })}</p>
            <ul className="space-y-0.5 text-xs">
              {preview.byType.map((b) => <li key={b.typeName}>{b.typeName}: {t("rates.avg")} {gel(b.oldAvg)} → <strong>{gel(b.newAvg)}</strong> GEL ({b.count})</li>)}
            </ul>
            <div className="max-h-56 overflow-y-auto rounded-lg bg-mist p-2">
              <table className="w-full text-xs tabular-nums">
                <thead><tr className="text-left text-ink-500"><th>{t("rates.date")}</th><th /><th>{t("rates.old")}</th><th>{t("rates.new")}</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.roomTypeId + r.date}>
                      <td>{r.date.slice(5)}</td><td className="max-w-20 truncate">{r.typeName}</td>
                      <td>{gel(r.oldPrice)}{r.oldMinStay ? ` · ${t("rates.minStayShort", { n: r.oldMinStay })}` : ""}{r.oldClosed ? " ⛔" : ""}</td>
                      <td className="font-semibold">{gel(r.newPrice)}{r.newMinStay ? ` · ${t("rates.minStayShort", { n: r.newMinStay })}` : ""}{r.newClosed ? " ⛔" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.count > preview.rows.length && <p className="mt-1 text-xs text-ink-500">{t("rates.more", { count: preview.count - preview.rows.length })}</p>}
            </div>
            <button type="button" onClick={() => run(applyRates, true)} disabled={pending} className="btn btn-primary w-full !min-h-10">{pending && <Loader2 size={15} className="animate-spin" />}{t("rates.apply", { count: preview.count })}</button>
          </div>
        )}
      </aside>
    </div>
  );
}
