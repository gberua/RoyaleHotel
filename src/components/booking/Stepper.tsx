"use client";
import { Minus, Plus } from "lucide-react";

export function Stepper({ label, hint, value, min, max, onChange, dec, inc, compact = false }: {
  label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void; dec: string; inc: string; compact?: boolean;
}) {
  const btn = compact ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className={`flex items-center justify-between gap-4 ${compact ? "py-1" : "py-2"}`}>
      <div>
        <p className={`font-semibold text-ink-900 ${compact ? "text-sm" : ""}`}>{label}</p>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${dec}: ${label}`} className={`grid ${btn} place-items-center rounded-full border border-ink-100 disabled:opacity-30`}>
          <Minus size={15} />
        </button>
        <span className="w-5 text-center font-semibold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${inc}: ${label}`} className={`grid ${btn} place-items-center rounded-full border border-ink-100 disabled:opacity-30`}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
