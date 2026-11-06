"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { createManualBooking, previewManualBooking, type ManualInput } from "@/app/admin/booking-actions";
import { formatMoney } from "@/lib/money";
import type { Quote } from "@/lib/booking/engine";
import { useErrorText } from "./ui";

type RT = { id: string; name: string; maxAdults: number; maxOccupancy: number };
type Ex = { id: string; name: string; price: number; unit: string };
type Line = { roomTypeId: string; adults: number; childAges: number[] };

/** Staff booking (phone / walk-in / WhatsApp) — priced and checked by the same engine as the website. */
export function ManualBookingForm({ roomTypes, extras, defaultCheckIn, defaultCheckOut, defaultRoomTypeId }: { roomTypes: RT[]; extras: Ex[]; defaultCheckIn: string; defaultCheckOut?: string; defaultRoomTypeId?: string }) {
  const t = useTranslations("admin");
  const errText = useErrorText();
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(() => defaultCheckOut ?? new Date(Date.parse(defaultCheckIn) + 2 * 86_400_000).toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([{ roomTypeId: defaultRoomTypeId ?? roomTypes[0]?.id ?? "", adults: 2, childAges: [] }]);
  const [ex, setEx] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState("");
  const [guest, setGuest] = useState({ firstName: "", lastName: "", email: "", phone: "+995 ", country: "" });
  const [source, setSource] = useState<ManualInput["source"]>("PHONE");
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const money = (n: number) => formatMoney(n, undefined, "en", 2);
  const base = () => ({ checkIn, checkOut, lines, extras: Object.entries(ex).filter(([, q]) => q > 0).map(([extraId, quantity]) => ({ extraId, quantity })), promoCode: promo || undefined });
  const invalidate = () => setQuote(null);

  const preview = () => start(async () => {
    const r = await previewManualBooking(base());
    if (r.ok) { setQuote(r.quote); setMsg(r.quote.promoError ? t("nb.promoNotApplied", { reason: t.has(`nb.promoErr.${r.quote.promoError}`) ? t(`nb.promoErr.${r.quote.promoError}`) : r.quote.promoError }) : null); }
    else { setQuote(null); setMsg(errText(r.message)); }
  });
  const create = () => start(async () => {
    const r = await createManualBooking({ ...base(), guest: { ...guest, email: guest.email || undefined, country: guest.country || undefined }, source, note, sendEmail });
    if (r && !r.ok) setMsg(errText(r.message));
  });
  const f = "field !min-h-10 !py-1.5 text-sm";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
          <h2 className="mb-3 font-semibold">{t("nb.stay")}</h2>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-ink-500">{t("bk.checkIn")}<input type="date" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); invalidate(); }} className={`${f} mt-1`} /></label>
            <label className="text-xs text-ink-500">{t("bk.checkOut")}<input type="date" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); invalidate(); }} className={`${f} mt-1`} /></label>
          </div>
          <ul className="mt-4 space-y-2">
            {lines.map((l, i) => {
              const rt = roomTypes.find((r) => r.id === l.roomTypeId);
              return (
                <li key={i} className="flex flex-wrap items-end gap-2 rounded-xl bg-mist p-3">
                  <label className="text-xs text-ink-500">{t("rooms.type")}<select value={l.roomTypeId} onChange={(e) => { setLines(lines.map((x, j) => (j === i ? { ...x, roomTypeId: e.target.value } : x))); invalidate(); }} className={`${f} mt-1 !w-auto`}>{roomTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
                  <label className="text-xs text-ink-500">{t("nb.adults")}<input type="number" min={1} max={rt?.maxAdults ?? 6} value={l.adults} onChange={(e) => { setLines(lines.map((x, j) => (j === i ? { ...x, adults: Number(e.target.value) } : x))); invalidate(); }} className={`${f} mt-1 !w-20`} /></label>
                  <label className="text-xs text-ink-500">{t("nb.childAges")}<input value={l.childAges.join(",")} onChange={(e) => { setLines(lines.map((x, j) => (j === i ? { ...x, childAges: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => n >= 0 && n < 18) } : x))); invalidate(); }} placeholder="4,9" className={`${f} mt-1 !w-36`} /></label>
                  {lines.length > 1 && <button type="button" onClick={() => { setLines(lines.filter((_, j) => j !== i)); invalidate(); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white" aria-label={t("nb.removeRoom")}><Trash2 size={16} /></button>}
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => { setLines([...lines, { roomTypeId: roomTypes[0]?.id ?? "", adults: 2, childAges: [] }]); invalidate(); }} className="mt-2 flex items-center gap-1 text-sm font-semibold text-sea-700"><Plus size={15} /> {t("nb.addRoom")}</button>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {extras.map((e) => (
              <label key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm">
                <span>{e.name} <span className="text-xs text-ink-500">{money(e.price)} {t(`extras.units.${e.unit}`)}</span></span>
                <input type="number" min={0} max={10} value={ex[e.id] ?? 0} onChange={(ev) => { setEx({ ...ex, [e.id]: Number(ev.target.value) }); invalidate(); }} className="field !min-h-8 !w-16 !py-1 text-sm" />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-500">{t("promos.code")}<input value={promo} onChange={(e) => { setPromo(e.target.value.toUpperCase()); invalidate(); }} className={`${f} mt-1 !w-40 uppercase`} /></label>
            <button type="button" onClick={preview} disabled={pending} className="btn btn-ghost !min-h-10 text-sm">{t("nb.check")}</button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
          <h2 className="mb-3 font-semibold">{t("bk.col.guest")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["firstName", "lastName", "phone", "email", "country"] as const).map((k) => (
              <label key={k} className="text-xs text-ink-500">{t(`nb.g.${k}`)}
                <input value={guest[k]} onChange={(e) => setGuest({ ...guest, [k]: e.target.value })} className={`${f} mt-1`} type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} />
              </label>
            ))}
            <label className="text-xs text-ink-500">{t("bk.source")}<select value={source} onChange={(e) => setSource(e.target.value as ManualInput["source"])} className={`${f} mt-1`}>{(["PHONE", "WALK_IN", "WHATSAPP", "OTHER"] as const).map((s) => <option key={s} value={s}>{t(`bk.sources.${s}`)}</option>)}</select></label>
          </div>
          <label className="mt-3 block text-xs text-ink-500">{t("common.notes")}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field mt-1 text-sm" /></label>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> {t("nb.sendEmail")}</label>
        </section>
      </div>

      <aside className="h-fit space-y-3 rounded-2xl bg-white p-5 ring-1 ring-ink-100 lg:sticky lg:top-20">
        <h2 className="font-semibold">{t("nb.summary")}</h2>
        {msg && <p role="alert" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950">{msg}</p>}
        {quote ? (
          <dl className="space-y-1 text-sm">
            {quote.rooms.map((r, i) => <div key={i} className="flex justify-between"><dt>{t("bk.room")} {i + 1} · {t("bk.nights", { n: quote.nightsCount })}</dt><dd className="tabular-nums">{money(r.roomTotal + r.extraGuestTotal)}</dd></div>)}
            {quote.extrasTotal > 0 && <div className="flex justify-between"><dt>{t("nav.extras")}</dt><dd>{money(quote.extrasTotal)}</dd></div>}
            {quote.discountTotal > 0 && <div className="flex justify-between text-sea-800"><dt>{t("bk.discount")}</dt><dd>−{money(quote.discountTotal)}</dd></div>}
            {quote.taxTotal > 0 && <div className="flex justify-between"><dt>{t("bk.cityTax")}</dt><dd>{money(quote.taxTotal)}</dd></div>}
            <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold"><dt>{t("bk.col.total")}</dt><dd>{money(quote.grandTotal)}</dd></div>
            <p className="text-xs text-ink-500">{t("nb.recheck")}</p>
          </dl>
        ) : <p className="text-sm text-ink-500">{t("nb.checkFirst")}</p>}
        <button type="button" onClick={create} disabled={pending || !quote || !guest.firstName || !guest.lastName || guest.phone.replace(/\D/g, "").length < 7} className="btn btn-primary w-full">{t("nb.create")}</button>
      </aside>
    </div>
  );
}
