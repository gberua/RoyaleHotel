"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";

/** Order + show/hide of the home page blocks, submitted with the surrounding form (order, hidden[]). */
export function SectionOrder({ sections, order: initialOrder, hidden: initialHidden }: { sections: { id: string; label: string }[]; order: string[]; hidden: string[] }) {
  const t = useTranslations("admin");
  const [order, setOrder] = useState(initialOrder);
  const [hidden, setHidden] = useState(new Set(initialHidden));
  const label = new Map(sections.map((s) => [s.id, s.label]));
  const move = (i: number, d: number) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div>
      <input type="hidden" name="order" value={order.join(",")} />
      {[...hidden].map((id) => <input key={id} type="hidden" name="hidden" value={id} />)}
      <ol className="space-y-1.5">
        <li className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2 text-sm text-ink-500">1. {t("content.heroFixed")}</li>
        {order.map((id, i) => (
          <li key={id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ring-ink-100 ${hidden.has(id) ? "bg-mist text-ink-500 line-through" : "bg-white"}`}>
            <span className="w-5 tabular-nums">{i + 2}.</span>
            <span className="flex-1 font-medium">{label.get(id)}</span>
            <button type="button" onClick={() => toggle(id)} aria-pressed={!hidden.has(id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-mist">
              {hidden.has(id) ? <><EyeOff size={14} aria-hidden /> {t("content.hiddenLabel")}</> : <><Eye size={14} aria-hidden /> {t("content.visible")}</>}
            </button>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("common.moveUp")} className="grid h-8 w-8 place-items-center rounded hover:bg-mist disabled:opacity-25"><ArrowUp size={15} /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={t("common.moveDown")} className="grid h-8 w-8 place-items-center rounded hover:bg-mist disabled:opacity-25"><ArrowDown size={15} /></button>
          </li>
        ))}
      </ol>
    </div>
  );
}
