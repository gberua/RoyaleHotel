"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysIso, toDate } from "@/lib/booking/dates";
import { useCalendarNames } from "@/lib/booking/calendar-names";

type Range = { checkIn: string | null; checkOut: string | null };

const monthStart = (iso: string) => iso.slice(0, 8) + "01";
const addMonths = (iso: string, n: number) => {
  const d = toDate(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/** Two-month date-range picker (Monday-first). Months sit side by side on wide screens, stacked on phones. */
export function RangeCalendar({ value, onChange, today, maxDate }: {
  value: Range;
  onChange: (r: Range) => void;
  today: string;
  maxDate: string;
}) {
  const t = useTranslations("drawer");
  const [first, setFirst] = useState(() => monthStart(value.checkIn ?? today));
  const [hover, setHover] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(value.checkIn ?? today);
  const root = useRef<HTMLDivElement>(null);

  const names = useCalendarNames();

  const pick = (iso: string) => {
    const { checkIn, checkOut } = value;
    if (!checkIn || checkOut || iso <= checkIn) onChange({ checkIn: iso, checkOut: null });
    else onChange({ checkIn, checkOut: iso });
  };

  const rangeEnd = value.checkOut ?? (value.checkIn && hover && hover > value.checkIn ? hover : null);
  const canPrev = first > monthStart(today);
  const canNext = addMonths(first, 1) < monthStart(maxDate);

  const onKey = (e: React.KeyboardEvent, iso: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDaysIso(iso, step);
    if (next < today || next > maxDate) return;
    if (next < first) setFirst(addMonths(first, -1));
    if (next >= addMonths(first, 2)) setFirst(addMonths(first, 1));
    setFocusDate(next);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  };

  const renderMonth = (start: string) => {
    const firstDay = toDate(start);
    const offset = (firstDay.getUTCDay() + 6) % 7; // Monday = 0
    const days = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)).getUTCDate();
    const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => addDaysIso(start, i))];
    return (
      <div key={start} className="min-w-0 flex-1">
        <p className="mb-3 text-center font-semibold capitalize text-ink-900">{names.month(start)}</p>
        <div className="grid grid-cols-7 text-center text-[0.72rem] font-semibold text-ink-500" aria-hidden>
          {names.weekdaysShort.map((w) => <span key={w} className="py-1">{w}</span>)}
        </div>
        <div className="grid grid-cols-7" role="grid">
          {cells.map((iso, i) => {
            if (!iso) return <span key={`e${i}`} />;
            const disabled = iso < today || iso > maxDate;
            const isStart = iso === value.checkIn;
            const isEnd = iso === rangeEnd;
            const inRange = !!value.checkIn && !!rangeEnd && iso > value.checkIn && iso < rangeEnd;
            const edge = isStart || isEnd;
            return (
              <div
                key={iso}
                className={`relative flex h-11 items-center justify-center ${inRange ? "bg-sea-50" : ""} ${isStart && rangeEnd ? "bg-gradient-to-r from-transparent from-50% to-sea-50 to-50%" : ""} ${isEnd && value.checkIn ? "bg-gradient-to-l from-transparent from-50% to-sea-50 to-50%" : ""}`}
              >
                <button
                  type="button"
                  data-date={iso}
                  disabled={disabled}
                  tabIndex={iso === focusDate ? 0 : -1}
                  onClick={() => { pick(iso); setFocusDate(iso); }}
                  onMouseEnter={() => setHover(iso)}
                  onKeyDown={(e) => onKey(e, iso)}
                  aria-label={names.long(iso)}
                  aria-pressed={edge}
                  className={`relative z-10 grid h-10 w-10 place-items-center rounded-full text-sm tabular-nums transition-colors ${
                    edge ? "bg-sea-500 font-semibold text-ink-950" : disabled ? "cursor-not-allowed text-ink-300 line-through decoration-ink-100" : "text-ink-900 hover:bg-sea-100"
                  } ${iso === today && !edge ? "font-bold underline decoration-sea-500 decoration-2 underline-offset-4" : ""}`}
                >
                  {Number(iso.slice(8))}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={root} className="relative" onMouseLeave={() => setHover(null)}>
      <div className="absolute inset-x-0 top-0 flex justify-between">
        <button type="button" onClick={() => setFirst(addMonths(first, -1))} disabled={!canPrev} aria-label={t("prevMonth")} className="grid h-9 w-9 place-items-center rounded-full text-ink-900 hover:bg-mist disabled:opacity-25">
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={() => setFirst(addMonths(first, 1))} disabled={!canNext} aria-label={t("nextMonth")} className="grid h-9 w-9 place-items-center rounded-full text-ink-900 hover:bg-mist disabled:opacity-25">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-6 pt-1 sm:flex-row sm:gap-8">
        {renderMonth(first)}
        {renderMonth(addMonths(first, 1))}
      </div>
    </div>
  );
}
