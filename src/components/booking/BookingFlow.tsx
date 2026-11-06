"use client";
/**
 * The guest booking flow — used inside the booking drawer and on /book.
 * stay (dates, guests, rooms) → extras → details → review & pay → done
 * The browser never computes the price it charges: every total shown in the review step comes from the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Check, Clock, Maximize2, Plus, Trash2, Users } from "lucide-react";
import { VoucherLink } from "./VoucherLink";
import { Link } from "@/i18n/navigation";
import { addDaysIso, nightsBetween, todayInGeorgia } from "@/lib/booking/dates";
import { useCalendarNames } from "@/lib/booking/calendar-names";
import type { Quote } from "@/lib/booking/engine";
import { abandonCheckout, checkoutOptions, completeCheckout, quoteHold, searchRooms, startCheckout, type RoomOption } from "@/actions/checkout";
import { useCurrency, useFormatPrice } from "@/components/layout/CurrencyProvider";
import { formatMoney } from "@/lib/money";
import { RangeCalendar } from "./RangeCalendar";
import { Stepper } from "./Stepper";

type Step = "stay" | "extras" | "details" | "review" | "done";
type Line = { key: string; roomTypeId: string; name: string; image: RoomOption["image"]; maxAdults: number; maxChildren: number; maxOccupancy: number; adults: number; childAges: number[] };
type Options = Awaited<ReturnType<typeof checkoutOptions>>;
type Guest = { firstName: string; lastName: string; email: string; phone: string; country: string; arrivalTime: string; specialRequests: string; marketingConsent: boolean };
export type FlowInitial = { checkIn?: string; checkOut?: string; adults?: number; childAges?: number[]; room?: string | null };

const STEPS: Step[] = ["stay", "extras", "details", "review"];
const STEP_LABEL = { stay: "checkout.stepRooms", extras: "checkout.stepExtras", details: "checkout.stepDetails", review: "checkout.stepReview" } as const;
const ARRIVAL_TIMES = ["", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00+"];

function ChildAges({ ages, onChange, label, ageLabel }: { ages: number[]; onChange: (a: number[]) => void; label: (n: number) => string; ageLabel: (a: number) => string }) {
  if (!ages.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3">
      {ages.map((age, i) => (
        <label key={i} className="text-xs text-ink-500">
          {label(i + 1)}
          <select value={age} onChange={(e) => onChange(ages.map((a, j) => (j === i ? Number(e.target.value) : a)))} className="field mt-1 !min-h-10 !py-1.5 text-sm">
            {Array.from({ length: 13 }, (_, a) => <option key={a} value={a}>{ageLabel(a)}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

function HoldTimer({ expiresAt, onExpire, label }: { expiresAt: string; onExpire: () => void; label: (time: string) => string }) {
  const [left, setLeft] = useState(() => Date.parse(expiresAt) - Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const ms = Date.parse(expiresAt) - Date.now();
      setLeft(ms);
      if (ms <= 0) { clearInterval(id); onExpire(); }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);
  const s = Math.max(0, Math.floor(left / 1000));
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${s < 120 ? "bg-amber-50 text-amber-900" : "bg-sea-50 text-sea-800"}`} role="timer" aria-live="off">
      <Clock size={14} aria-hidden /> {label(time)}
    </p>
  );
}

export function BookingFlow({ initial, preselect, compact = false }: { initial?: FlowInitial; preselect?: string | null; compact?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const names = useCalendarNames();
  const price = useFormatPrice();
  const { code: currencyCode } = useCurrency();
  const today = useMemo(() => todayInGeorgia(), []);
  const topRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("stay");
  const [range, setRange] = useState<{ checkIn: string | null; checkOut: string | null }>({ checkIn: initial?.checkIn ?? null, checkOut: initial?.checkOut ?? null });
  const [adults, setAdults] = useState(initial?.adults ?? 2);
  const [childAges, setChildAges] = useState<number[]>(initial?.childAges ?? []);
  const [results, setResults] = useState<{ key: string; rooms: RoomOption[] } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [hold, setHold] = useState<{ id: string; expiresAt: string } | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [guest, setGuest] = useState<Guest>({ firstName: "", lastName: "", email: "", phone: "+995 ", country: "", arrivalTime: "", specialRequests: "", marketingConsent: false });
  const [badFields, setBadFields] = useState<string[]>([]);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; ok: boolean } | null>(null);
  const [quote, setQuote] = useState<{ quote: Quote; deposit: number } | null>(null);
  const [plan, setPlan] = useState<"pay_at_hotel" | "deposit" | "full">("pay_at_hotel");
  const [accept, setAccept] = useState(false);
  const [done, setDone] = useState<{ code: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const autoAdded = useRef<string | null>(null);

  const nights = range.checkIn && range.checkOut ? nightsBetween(range.checkIn, range.checkOut) : 0;
  const searchKey = range.checkIn && range.checkOut ? JSON.stringify([range.checkIn, range.checkOut, adults, childAges]) : "";
  const errText = (code: string) => (t.has(`checkout.err.${code}`) ? t(`checkout.err.${code}`) : t("checkout.err.generic"));
  const scrollTop = () => topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });

  const addRoom = useCallback((r: RoomOption) => {
    setLines((cur) => {
      const usedA = cur.reduce((a, l) => a + l.adults, 0);
      const usedC = cur.reduce((a, l) => a + l.childAges.length, 0);
      const a = Math.max(1, Math.min(r.maxAdults, adults - usedA || 1));
      const kids = childAges.slice(usedC, usedC + Math.max(0, Math.min(r.maxOccupancy - a, r.maxChildren + (r.maxAdults - a))));
      return [...cur, { key: `${r.roomTypeId}-${Date.now()}-${cur.length}`, roomTypeId: r.roomTypeId, name: r.name, image: r.image, maxAdults: r.maxAdults, maxChildren: r.maxChildren, maxOccupancy: r.maxOccupancy, adults: a, childAges: kids }];
    });
  }, [adults, childAges]);

  // ── live search ──
  useEffect(() => {
    if (!searchKey || step !== "stay") return;
    const key = searchKey;
    const id = setTimeout(() => {
      start(async () => {
        const res = await searchRooms({ checkIn: range.checkIn!, checkOut: range.checkOut!, adults, childAges, locale });
        if (res.ok) {
          setResults({ key, rooms: res.rooms });
          setError(null);
          // Room preselected from a room page / card: add it once, if available for these dates
          const pre = preselect ? res.rooms.find((x) => x.slug === preselect && x.status === "available") : undefined;
          if (pre && autoAdded.current !== `${preselect}|${key}`) {
            autoAdded.current = `${preselect}|${key}`;
            addRoom(pre);
          }
        }
        else { setResults({ key, rooms: [] }); setError(res.error); }
      });
    }, 180);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, step]);

  const rooms = useMemo(() => (results?.key === searchKey ? results.rooms : []), [results, searchKey]);
  const placed = { adults: lines.reduce((a, l) => a + l.adults, 0), children: lines.reduce((a, l) => a + l.childAges.length, 0) };
  const inCart = (id: string) => lines.filter((l) => l.roomTypeId === id).length;


  const lineValid = (l: Line) => l.adults >= 1 && l.adults <= l.maxAdults && l.adults + l.childAges.length <= l.maxOccupancy;

  // ── navigation ──
  const onHoldExpired = useCallback(() => {
    setHold(null);
    setStep("stay");
    setError("hold_expired");
  }, []);

  const toExtras = () => start(async () => {
    setError(null);
    const res = await startCheckout({ checkIn: range.checkIn!, checkOut: range.checkOut!, locale, previousHoldId: hold?.id, lines: lines.map((l) => ({ roomTypeId: l.roomTypeId, adults: l.adults, childAges: l.childAges })) });
    if (!res.ok) { setError(res.error); return; }
    setHold({ id: res.holdId, expiresAt: res.holdExpiresAt });
    if (!options) setOptions(await checkoutOptions(locale));
    setStep("extras");
    scrollTop();
  });

  const extrasList = () => Object.entries(extras).filter(([, q]) => q > 0).map(([extraId, quantity]) => ({ extraId, quantity }));

  const loadQuote = (code?: string) => start(async () => {
    if (!hold) return;
    const res = await quoteHold({ holdId: hold.id, extras: extrasList(), promoCode: code });
    if (!res.ok) { setError(res.error); if (res.error === "hold_expired") onHoldExpired(); return; }
    setQuote({ quote: res.quote, deposit: res.deposit });
    if (code) setPromo({ code, ok: !!res.quote.promo });
    setError(null);
  });

  const toReview = () => {
    const missing = (["firstName", "lastName", "email", "phone"] as const).filter((k) => !guest[k].trim() || (k === "phone" && guest.phone.replace(/\D/g, "").length < 7) || (k === "email" && !/^\S+@\S+\.\S+$/.test(guest.email)));
    setBadFields(missing);
    if (missing.length) { setError("invalid"); return; }
    setError(null);
    setStep("review");
    loadQuote(promo?.ok ? promo.code : undefined);
    scrollTop();
  };

  const submit = () => start(async () => {
    if (!hold) return;
    setError(null);
    const res = await completeCheckout({
      holdId: hold.id, locale, plan, acceptPolicies: accept, extras: extrasList(), promoCode: promo?.ok ? promo.code : undefined,
      guest: { ...guest, phone: guest.phone.trim(), arrivalTime: guest.arrivalTime || undefined, country: guest.country || undefined, specialRequests: guest.specialRequests || undefined },
    });
    if (!res.ok) {
      setError(res.error);
      if ("fields" in res && res.fields) setBadFields(res.fields);
      if (res.error === "hold_expired") onHoldExpired();
      return;
    }
    if (res.status === "redirect") { window.location.href = res.url; return; }
    setDone({ code: res.code, email: res.email });
    setStep("done");
    scrollTop();
  });

  const restart = () => {
    if (hold && step !== "done") abandonCheckout(hold.id);
    setHold(null); setLines([]); setQuote(null); setPromo(null); setDone(null); setExtras({}); setAccept(false); setStep("stay"); setError(null);
  };

  const freeUntil = range.checkIn && options ? addDaysIso(range.checkIn, -options.freeCancellationDays) : null;
  const unitLabel = (u: string) => ({ PER_STAY: t("checkout.perStay"), PER_NIGHT: t("checkout.perNightUnit"), PER_GUEST: t("checkout.perGuest"), PER_GUEST_NIGHT: t("checkout.perGuestNight") })[u] ?? "";

  // ───────────────────────────── render ─────────────────────────────
  return (
    <div ref={topRef} className="scroll-mt-4">
      {step !== "done" && (
        <ol className="mb-5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide" aria-label="Steps">
          {STEPS.map((s, i) => {
            const idx = STEPS.indexOf(step);
            return (
              <li key={s} className={`flex items-center gap-1.5 ${i <= idx ? "text-sea-800" : "text-ink-300"}`} aria-current={s === step ? "step" : undefined}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[0.65rem] ${i < idx ? "bg-sea-500 text-ink-950" : i === idx ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-500"}`}>{i < idx ? <Check size={11} /> : i + 1}</span>
                <span className={s === step ? "" : "max-sm:hidden"}>{t(STEP_LABEL[s as keyof typeof STEP_LABEL])}</span>
                {i < STEPS.length - 1 && <span className="mx-0.5 h-px w-3 bg-ink-100" aria-hidden />}
              </li>
            );
          })}
        </ol>
      )}

      {hold && step !== "stay" && step !== "done" && <div className="mb-4"><HoldTimer expiresAt={hold.expiresAt} onExpire={onHoldExpired} label={(time) => t("checkout.holdTimer", { time })} /></div>}

      {error && (
        <p role="alert" className="mb-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          <AlertCircle size={18} className="shrink-0" aria-hidden /> {error === "hold_expired" ? t("checkout.holdExpired") : errText(error)}
        </p>
      )}

      {/* ───── STEP 1: stay ───── */}
      {step === "stay" && (
        <div className="space-y-6">
          <section aria-label={t("drawer.dates")}>
            <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-ink-100">
              {(["checkIn", "checkOut"] as const).map((k) => (
                <div key={k} className={`px-4 py-3 ${k === "checkOut" ? "border-l border-ink-100" : ""} ${(k === "checkIn" ? !range.checkIn : !!range.checkIn && !range.checkOut) ? "bg-sea-50" : ""}`}>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-500">{t(`drawer.${k}`)}</p>
                  <p className="mt-0.5 font-semibold text-ink-900">{range[k] ? names.short(range[k]!) : <span className="text-ink-300">{t("drawer.addDate")}</span>}</p>
                </div>
              ))}
            </div>
            <RangeCalendar value={range} onChange={(r) => { setRange(r); setLines([]); }} today={today} maxDate={addDaysIso(today, 450)} />
            <div className="mt-2 flex min-h-6 items-center justify-between text-sm">
              <span className="text-ink-700">{nights > 0 ? t("drawer.nightsSelected", { count: nights }) : range.checkIn ? t("drawer.chooseCheckOut") : ""}</span>
              {range.checkIn && <button type="button" onClick={() => { setRange({ checkIn: null, checkOut: null }); setLines([]); }} className="font-semibold text-sea-700 hover:underline">{t("drawer.clear")}</button>}
            </div>
          </section>

          <section aria-label={t("drawer.guests")} className="border-t border-ink-100 pt-3">
            <Stepper label={t("booking.adults")} hint={t("booking.adultsHint")} value={adults} min={1} max={12} onChange={(n) => { setAdults(n); setLines([]); }} dec={t("booking.decrease")} inc={t("booking.increase")} />
            <Stepper label={t("booking.children")} hint={t("booking.childrenHint")} value={childAges.length} min={0} max={8} onChange={(n) => { setChildAges((a) => (n > a.length ? [...a, ...Array(n - a.length).fill(6)] : a.slice(0, n))); setLines([]); }} dec={t("booking.decrease")} inc={t("booking.increase")} />
            <ChildAges ages={childAges} onChange={(a) => { setChildAges(a); setLines([]); }} label={(n) => t("checkout.childAge", { n })} ageLabel={(age) => t("checkout.ageYears", { age })} />
          </section>

          <section aria-live="polite" aria-busy={pending} className="border-t border-ink-100 pt-5">
            {!searchKey ? (
              <p className="rounded-2xl bg-mist p-5 text-ink-700">{t("drawer.chooseDates")}</p>
            ) : !results || results.key !== searchKey ? (
              <ul className="space-y-3">{[0, 1, 2].map((i) => <li key={i} className="h-28 animate-pulse rounded-2xl bg-mist" />)}</ul>
            ) : (
              <>
                <h3 className="mb-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-ink-500">{t("drawer.available")}</h3>
                {!rooms.some((r) => r.status === "available") && <p className="mb-3 rounded-2xl bg-sand-50 p-4 text-ink-700">{t("drawer.none")}</p>}
                <ul className="space-y-3">
                  {rooms.map((r) => {
                    const ok = r.status === "available";
                    const count = inCart(r.roomTypeId);
                    const note = r.status === "sold_out" ? t("drawer.soldOut") : r.status === "min_stay" ? t("drawer.minStay", { count: r.minStay }) : r.status === "closed" ? t("drawer.closed") : r.roomsLeft <= 2 ? t("drawer.roomsLeft", { count: r.roomsLeft }) : null;
                    return (
                      <li key={r.roomTypeId} className={`rounded-2xl p-3 ring-1 ${count ? "ring-2 ring-sea-500" : "ring-ink-100"} ${ok ? "" : "opacity-55"}`}>
                        <div className="flex gap-3">
                          <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-mist sm:h-24 sm:w-32">
                            {r.image && <Image src={r.image.url} alt="" fill sizes="128px" placeholder={r.image.blur ? "blur" : "empty"} blurDataURL={r.image.blur ?? undefined} className="object-cover" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-display text-[1.5rem] leading-[1.05] text-ink-900">{r.name}</p>
                            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-500">
                              {r.sizeM2 && <span className="flex items-center gap-1"><Maximize2 size={12} aria-hidden />{t("rooms.size", { value: r.sizeM2 })}</span>}
                              <span className="flex items-center gap-1"><Users size={12} aria-hidden />{r.maxOccupancy}</span>
                              {r.fitsParty && ok && <span className="text-sea-700">{t("checkout.fitsParty")}</span>}
                            </p>
                            {note && <p className={`mt-1 text-xs font-semibold ${ok ? "text-sea-700" : "text-ink-700"}`}>{note}</p>}
                          </div>
                        </div>
                        {ok && (
                          <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                            <p className="leading-tight">
                              <span className="text-lg font-semibold text-ink-900">{price(r.averageNightly)}</span> <span className="text-xs text-ink-500">{t("drawer.perNight")}</span>
                              <span className="block text-xs text-ink-500">{t("drawer.totalFor", { total: price(r.roomTotal), nights: r.nights })}</span>
                            </p>
                            <button type="button" onClick={() => addRoom(r)} disabled={count >= r.roomsLeft} className="btn btn-accent !min-h-10 shrink-0 !px-4 text-sm">
                              <Plus size={15} aria-hidden /> {count ? t("checkout.oneMore") : t("checkout.addRoom")}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          {lines.length > 0 && (
            <section className="rounded-2xl bg-mist p-4" aria-label={t("checkout.yourRooms")}>
              <h3 className="mb-2 font-sans text-sm font-semibold text-ink-900">{t("checkout.yourRooms")}</h3>
              <ul className="space-y-3">
                {lines.map((l, i) => (
                  <li key={l.key} className={`rounded-xl bg-white p-3 ${lineValid(l) ? "" : "ring-2 ring-amber-400"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">{t("checkout.roomN", { n: i + 1 })} · {l.name}</p>
                      <button type="button" onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))} aria-label={t("checkout.removeRoom")} className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-mist"><Trash2 size={15} /></button>
                    </div>
                    <Stepper compact label={t("booking.adults")} value={l.adults} min={1} max={l.maxAdults} onChange={(n) => setLines((c) => c.map((x) => (x.key === l.key ? { ...x, adults: n } : x)))} dec={t("booking.decrease")} inc={t("booking.increase")} />
                    <Stepper compact label={t("booking.children")} value={l.childAges.length} min={0} max={Math.max(0, l.maxOccupancy - l.adults)} onChange={(n) => setLines((c) => c.map((x) => (x.key === l.key ? { ...x, childAges: n > x.childAges.length ? [...x.childAges, ...Array(n - x.childAges.length).fill(6)] : x.childAges.slice(0, n) } : x)))} dec={t("booking.decrease")} inc={t("booking.increase")} />
                    <ChildAges ages={l.childAges} onChange={(a) => setLines((c) => c.map((x) => (x.key === l.key ? { ...x, childAges: a } : x)))} label={(n) => t("checkout.childAge", { n })} ageLabel={(age) => t("checkout.ageYears", { age })} />
                  </li>
                ))}
              </ul>
              {(placed.adults !== adults || placed.children !== childAges.length) && <p className="mt-2 text-xs text-ink-500">{t("checkout.guestsSummary", { adults: placed.adults, children: placed.children })}</p>}
              <button type="button" onClick={toExtras} disabled={pending || !lines.every(lineValid)} className="btn btn-primary mt-4 w-full">
                {pending ? t("checkout.processing") : t("checkout.continue")} <ArrowRight size={16} aria-hidden />
              </button>
            </section>
          )}
        </div>
      )}

      {/* ───── STEP 2: extras ───── */}
      {step === "extras" && options && (
        <div className="space-y-4">
          <h3 className="text-3xl leading-none">{t("checkout.extrasTitle")}</h3>
          {options.extras.length === 0 && <p className="text-ink-500">{t("checkout.extrasNone")}</p>}
          <ul className="space-y-2">
            {options.extras.map((e) => {
              const q = extras[e.id] ?? 0;
              return (
                <li key={e.id} className={`rounded-2xl p-4 ring-1 ${q ? "ring-2 ring-sea-500" : "ring-ink-100"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{e.name}</p>
                      {e.description && <p className="text-sm text-ink-500">{e.description}</p>}
                      <p className="mt-1 text-sm text-ink-700">{e.price ? `${price(e.price)} ${unitLabel(e.unit)}` : "0 ₾"}</p>
                    </div>
                    {e.unit === "PER_STAY" && e.key !== "airport-transfer" ? (
                      <input type="checkbox" aria-label={e.name} checked={q > 0} onChange={(ev) => setExtras((x) => ({ ...x, [e.id]: ev.target.checked ? 1 : 0 }))} className="mt-1 h-5 w-5 accent-sea-700" />
                    ) : (
                      <div className="w-36 shrink-0"><Stepper compact label="" value={q} min={0} max={e.unit === "PER_STAY" ? 4 : 1} onChange={(n) => setExtras((x) => ({ ...x, [e.id]: n }))} dec={t("booking.decrease")} inc={t("booking.increase")} /></div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep("stay")} className="btn btn-ghost"><ArrowLeft size={16} aria-hidden /> {t("checkout.back")}</button>
            <button type="button" onClick={() => { setStep("details"); scrollTop(); }} className="btn btn-primary flex-1">{t("checkout.continue")} <ArrowRight size={16} aria-hidden /></button>
          </div>
        </div>
      )}

      {/* ───── STEP 3: details ───── */}
      {step === "details" && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toReview(); }} noValidate>
          <h3 className="text-3xl leading-none">{t("checkout.detailsTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["firstName", "lastName"] as const).map((k) => (
              <div key={k}>
                <label className="label" htmlFor={`g-${k}`}>{t(`checkout.${k}`)} *</label>
                <input id={`g-${k}`} className="field" value={guest[k]} onChange={(e) => setGuest({ ...guest, [k]: e.target.value })} autoComplete={k === "firstName" ? "given-name" : "family-name"} aria-invalid={badFields.includes(k)} required />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="g-email">{t("checkout.email")} *</label>
              <input id="g-email" type="email" className="field" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} autoComplete="email" aria-invalid={badFields.includes("email")} required />
            </div>
            <div>
              <label className="label" htmlFor="g-phone">{t("checkout.phone")} *</label>
              <input id="g-phone" type="tel" inputMode="tel" className="field" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} autoComplete="tel" aria-invalid={badFields.includes("phone")} aria-describedby="g-phone-hint" required />
              <p id="g-phone-hint" className="mt-1 text-xs text-ink-500">{t("checkout.phoneHint")}</p>
            </div>
            <div>
              <label className="label" htmlFor="g-country">{t("checkout.country")}</label>
              <input id="g-country" className="field" value={guest.country} onChange={(e) => setGuest({ ...guest, country: e.target.value })} autoComplete="country-name" />
            </div>
            <div>
              <label className="label" htmlFor="g-arrival">{t("checkout.arrivalTime")}</label>
              <select id="g-arrival" className="field" value={guest.arrivalTime} onChange={(e) => setGuest({ ...guest, arrivalTime: e.target.value })}>
                {ARRIVAL_TIMES.map((a) => <option key={a} value={a}>{a || t("checkout.arrivalUnknown")}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="g-req">{t("checkout.specialRequests")}</label>
            <textarea id="g-req" rows={3} maxLength={1000} className="field resize-y" placeholder={t("checkout.specialRequestsHint")} value={guest.specialRequests} onChange={(e) => setGuest({ ...guest, specialRequests: e.target.value })} />
          </div>
          <label className="flex items-start gap-3 text-sm text-ink-700">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-sea-700" checked={guest.marketingConsent} onChange={(e) => setGuest({ ...guest, marketingConsent: e.target.checked })} />
            {t("checkout.marketing")}
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep("extras")} className="btn btn-ghost"><ArrowLeft size={16} aria-hidden /> {t("checkout.back")}</button>
            <button type="submit" className="btn btn-primary flex-1">{t("checkout.continue")} <ArrowRight size={16} aria-hidden /></button>
          </div>
        </form>
      )}

      {/* ───── STEP 4: review & pay ───── */}
      {step === "review" && (
        <div className="space-y-5">
          <h3 className="text-3xl leading-none">{t("checkout.reviewTitle")}</h3>
          {!quote ? (
            <div className="h-48 animate-pulse rounded-2xl bg-mist" />
          ) : (
            <section className={`rounded-2xl bg-mist p-4 text-sm transition-opacity ${pending ? "opacity-60" : ""}`} aria-label={t("checkout.breakdown")}>
              <p className="mb-2 font-semibold text-ink-900">{range.checkIn && names.short(range.checkIn)} → {range.checkOut && names.short(range.checkOut)} · {t("drawer.nightsSelected", { count: quote.quote.nightsCount })}</p>
              {quote.quote.rooms.map((r, i) => (
                <div key={i} className="border-t border-ink-100 py-2">
                  <p className="font-semibold text-ink-900">{t("checkout.roomN", { n: i + 1 })} · {lines[i]?.name} <span className="font-normal text-ink-500">· {t("checkout.guestsSummary", { adults: r.adults, children: r.childAges.length })}</span></p>
                  <ul className="mt-1 space-y-0.5 text-ink-700">
                    {r.nights.map((n) => <li key={n.date} className="flex justify-between"><span>{names.short(n.date)}</span><span className="tabular-nums">{price(n.price)}</span></li>)}
                    {r.extraGuests.map((g, j) => (
                      <li key={j} className="flex justify-between"><span>{g.kind === "child" ? t("checkout.childLine", { age: t("checkout.ageYears", { age: g.age ?? 0 }) }) : t("checkout.extraAdult")} × {quote.quote.nightsCount}</span><span className="tabular-nums">{price(g.total ?? g.perNight * quote.quote.nightsCount)}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
              {quote.quote.extras.length > 0 && (
                <div className="border-t border-ink-100 py-2">
                  <p className="font-semibold text-ink-900">{t("checkout.extrasLabel")}</p>
                  {quote.quote.extras.map((e) => <p key={e.extraId} className="flex justify-between text-ink-700"><span>{options?.extras.find((x) => x.id === e.extraId)?.name} ×{e.quantity}</span><span className="tabular-nums">{price(e.total)}</span></p>)}
                </div>
              )}
              {quote.quote.promo && <p className="flex justify-between border-t border-ink-100 py-2 text-sea-800"><span>{t("checkout.discount", { code: quote.quote.promo.code })}</span><span className="tabular-nums">−{price(quote.quote.discountTotal)}</span></p>}
              {quote.quote.taxTotal > 0 && <p className="flex justify-between border-t border-ink-100 py-2 text-ink-700"><span>{t("checkout.cityTax")}</span><span className="tabular-nums">{price(quote.quote.taxTotal)}</span></p>}
              <p className="flex items-baseline justify-between border-t border-ink-900/20 pt-3 text-lg font-semibold text-ink-900" data-testid="grand-total"><span>{t("checkout.total")}</span><span className="tabular-nums">{price(quote.quote.grandTotal)}</span></p>
              {currencyCode !== "GEL" && <p className="mt-1 text-xs text-ink-500">{t("checkout.chargedInGel", { amount: formatMoney(quote.quote.grandTotal, undefined, locale) })}</p>}
            </section>
          )}

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (promoInput.trim()) loadQuote(promoInput.trim().toUpperCase()); }}>
            <label className="sr-only" htmlFor="promo">{t("checkout.promoCode")}</label>
            <input id="promo" className="field !min-h-11 uppercase" placeholder={t("checkout.promoCode")} value={promoInput} onChange={(e) => setPromoInput(e.target.value)} />
            <button type="submit" className="btn btn-ghost !min-h-11 shrink-0" disabled={pending || !promoInput.trim()}>{t("checkout.apply")}</button>
          </form>
          {promo && <p className={`-mt-3 text-sm ${promo.ok ? "text-sea-800" : "text-danger"}`}>{promo.ok ? t("checkout.promoApplied") : t("checkout.promoInvalid")}</p>}

          {options && quote && (
            <fieldset className="space-y-2">
              <legend className="mb-2 font-semibold text-ink-900">{t("checkout.howToPay")}</legend>
              {([
                ["pay_at_hotel", t("checkout.payAtHotel"), t("checkout.payAtHotelText")],
                ["deposit", t("checkout.deposit", { percent: options.depositPercent }), t("checkout.depositText", { amount: price(quote.deposit) })],
                ["full", t("checkout.full"), t("checkout.fullText")],
              ] as const).filter(([k]) => options.plans[k]).map(([k, label, text]) => (
                <label key={k} className={`flex cursor-pointer gap-3 rounded-2xl p-4 ring-1 ${plan === k ? "ring-2 ring-sea-500" : "ring-ink-100"}`}>
                  <input type="radio" name="plan" value={k} checked={plan === k} onChange={() => setPlan(k)} className="mt-1 h-4 w-4 accent-sea-700" />
                  <span><span className="block font-semibold text-ink-900">{label}</span><span className="text-sm text-ink-500">{text}</span></span>
                </label>
              ))}
            </fieldset>
          )}

          {freeUntil && <p className="flex items-center gap-2 text-sm text-sea-800"><BadgeCheck size={16} aria-hidden /> {t("checkout.freeCancelUntil", { date: names.short(freeUntil) })}</p>}
          <label className="flex items-start gap-3 text-sm text-ink-700">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1 h-4 w-4 accent-sea-700" required />
            <span>{t("checkout.acceptPolicies")} <Link href="/policies/cancellation" target="_blank" className="text-sea-700 underline underline-offset-2">{t("checkout.policiesLink")}</Link></span>
          </label>

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("details")} className="btn btn-ghost"><ArrowLeft size={16} aria-hidden /> {t("checkout.back")}</button>
            <button type="button" onClick={submit} disabled={!accept || !quote || pending} className="btn btn-accent flex-1" data-testid="submit-booking">
              {pending ? t("checkout.processing") : plan === "pay_at_hotel" ? t("checkout.confirmBooking") : t("checkout.payNow", { amount: price(plan === "full" ? quote?.quote.grandTotal ?? 0 : quote?.deposit ?? 0) })}
            </button>
          </div>
        </div>
      )}

      {/* ───── DONE ───── */}
      {step === "done" && done && (
        <div className="space-y-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sea-500 text-ink-950"><Check size={28} aria-hidden /></span>
          <h3 className="text-4xl leading-none">{t("checkout.confirmedTitle")}</h3>
          <p className="text-ink-500">{t("checkout.confirmedText")}</p>
          <div className="mx-auto max-w-xs rounded-2xl bg-sea-50 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-500">{t("checkout.codeLabel")}</p>
            <p className="font-sans text-3xl font-bold tracking-wide text-sea-800" data-testid="booking-code">{done.code}</p>
          </div>
          <p className="text-sm text-ink-700">{t("checkout.emailSent", { email: done.email })}</p>
          <div className={`flex flex-col gap-2 ${compact ? "" : "sm:flex-row sm:justify-center"}`}>
            <VoucherLink label={t("checkout.downloadVoucher")} />
            <Link href="/booking/manage" className="btn btn-ghost">{t("checkout.manage")}</Link>
          </div>
          <button type="button" onClick={restart} className="text-sm font-semibold text-sea-700 hover:underline">{t("checkout.newSearch")}</button>
        </div>
      )}
    </div>
  );
}
