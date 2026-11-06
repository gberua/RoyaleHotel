"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { AdminForm, type ActionResult } from "./ui";

/** Drag-and-drop list (mouse) with up/down buttons (phones, keyboard). Saves the new order through a server action. */
export function SortableList({ items, action, extra = {}, layout = "list" }: {
  items: { id: string; node: ReactNode }[]; action: (p: ActionResult, f: FormData) => Promise<ActionResult>; extra?: Record<string, string>; layout?: "list" | "grid";
}) {
  const t = useTranslations("admin.common");
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [drag, setDrag] = useState<string | null>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const ids = order.filter((id) => byId.has(id)).concat(items.map((i) => i.id).filter((id) => !order.includes(id)));
  const changed = ids.join() !== items.map((i) => i.id).join();
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
  };
  return (
    <div>
      <p className="mb-2 text-xs text-ink-500">{t("dragHint")}</p>
      <ul className={layout === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" : "space-y-2"}>
        {ids.map((id, i) => (
          <li
            key={id}
            draggable
            onDragStart={() => setDrag(id)}
            onDragOver={(e) => { e.preventDefault(); if (drag && drag !== id) move(ids.indexOf(drag), i); }}
            onDragEnd={() => setDrag(null)}
            className={`relative rounded-xl bg-white ring-1 ring-ink-100 ${drag === id ? "opacity-50 ring-2 ring-sea-500" : ""}`}
          >
            <div className={`flex ${layout === "grid" ? "flex-col" : "items-center"} gap-2 p-2`}>
              <div className={`flex ${layout === "grid" ? "justify-between" : "flex-col"} items-center text-ink-500`}>
                <GripVertical size={16} className="cursor-grab" aria-hidden />
                <span className="flex gap-0.5">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t("moveUp")} className="grid h-7 w-7 place-items-center rounded hover:bg-mist disabled:opacity-25"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === ids.length - 1} aria-label={t("moveDown")} className="grid h-7 w-7 place-items-center rounded hover:bg-mist disabled:opacity-25"><ArrowDown size={14} /></button>
                </span>
              </div>
              <div className="min-w-0 flex-1">{byId.get(id)!.node}</div>
            </div>
          </li>
        ))}
      </ul>
      {changed && (
        <AdminForm action={action} submit={t("save")} className="mt-3">
          <input type="hidden" name="order" value={ids.join(",")} />
          {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <span className="text-xs text-amber-800">{t("unsaved")}</span>
        </AdminForm>
      )}
    </div>
  );
}
