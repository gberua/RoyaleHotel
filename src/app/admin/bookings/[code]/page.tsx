import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, FileDown, MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { loadBooking } from "@/lib/booking/load";
import { allowedTransitions, cancellationPreview, loadSettings } from "@/lib/booking/service";
import { whatsappLink } from "@/lib/notify/templates";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";
import type { Quote } from "@/lib/booking/engine";
import { AdminFrame, StatusChip } from "@/components/admin/AdminFrame";
import { AdminForm } from "@/components/admin/ui";
import { StatusButton } from "@/components/admin/StatusButton";
import { adminAddNote, adminCancel, adminChangeDates, adminMoveRoom, adminRecordPayment, adminResendConfirmation } from "../../booking-actions";

export const metadata: Metadata = { title: "Booking" };
const money = (n: number) => formatMoney(n, undefined, "en", 2);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const card = "rounded-2xl bg-white p-5 ring-1 ring-ink-100";
const h2 = "mb-3 font-sans text-base font-semibold";
const fld = "field mt-1 !min-h-10 !py-1.5 text-sm";

async function Detail({ params }: { params: PageProps<"/admin/bookings/[code]">["params"] }) {
  await connection();
  const user = await requirePermission("bookings");
  const t = await adminT(user.adminLocale);
  const L = user.adminLocale;
  const { code } = await params;
  const b = await loadBooking({ code: decodeURIComponent(code) });
  if (!b) notFound();
  const [rooms, activity, terms] = await Promise.all([
    db.room.findMany({ where: { active: true }, include: { roomType: { select: { name: true } } }, orderBy: { number: "asc" } }),
    db.activityLog.findMany({ where: { entityId: b.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    ["PENDING", "CONFIRMED"].includes(b.status) ? cancellationPreview(b.id) : Promise.resolve(null),
  ]);
  const q = b.priceBreakdown as unknown as Quote | null;
  const active = b.rooms.filter((r) => r.active);
  const transitions = allowedTransitions(b.status).filter((s) => s !== "CANCELLED");
  const editable = ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(b.status);
  const wa = await whatsappLink(b, await loadSettings());

  return (
    <AdminFrame user={user} title={`${t("bk.booking")} ${b.code}`} actions={<Link href="/admin/bookings" className="btn btn-ghost !min-h-10 text-sm"><ArrowLeft size={15} aria-hidden /> {t("bk.all")}</Link>}>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className={card}>
            <div className="flex flex-wrap items-center gap-3">
              <StatusChip status={b.status} label={t(`bk.status.${b.status}`)} />
              <span className="text-sm text-ink-500">{t(`bk.sources.${b.source}`)} · {t("bk.created")} {stamp(b.createdAt)}{b.confirmedAt ? ` · ${t("bk.confirmedAt")} ${stamp(b.confirmedAt)}` : ""}</span>
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-500">{t("bk.stay")}</dt><dd className="font-semibold">{iso(b.checkIn)} → {iso(b.checkOut)}</dd></div>
              <div><dt className="text-ink-500">{t("bk.guests")}</dt><dd className="font-semibold">{t("bk.adults", { n: b.adults })}{b.children ? `, ${t("bk.children", { n: b.children })} (${b.childAges.join(", ")})` : ""}</dd></div>
              <div><dt className="text-ink-500">{t("bk.language")}</dt><dd className="font-semibold uppercase">{b.locale}</dd></div>
              <div className="sm:col-span-2"><dt className="text-ink-500">{t("bk.col.guest")}</dt><dd className="font-semibold">{b.guest ? `${b.guest.firstName} ${b.guest.lastName}` : "—"}</dd><dd>{b.guest?.email} · <a className="text-sea-700" href={`tel:${b.guest?.phone}`}>{b.guest?.phone}</a> {b.guest?.country && `· ${b.guest.country}`}</dd></div>
              <div><dt className="text-ink-500">{t("bk.arrivalTime")}</dt><dd className="font-semibold">{b.arrivalTime ?? "—"}</dd></div>
              {b.specialRequests && <div className="sm:col-span-3"><dt className="text-ink-500">{t("bk.requests")}</dt><dd className="whitespace-pre-wrap rounded-lg bg-amber-50 p-2">{b.specialRequests}</dd></div>}
              {b.cancelReason && <div className="sm:col-span-3"><dt className="text-ink-500">{t("bk.cancellation")}</dt><dd>{b.cancelReason} {b.refundAmount ? `· ${t("bk.refund")} ${money(b.refundAmount)}` : ""}</dd></div>}
            </dl>
            {transitions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
                {transitions.map((to) => (
                  <StatusButton key={to} code={b.code} to={to as "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW"} label={t(`bk.to.${to}`)} tone={to === "NO_SHOW" ? "ghost" : "primary"} confirmText={to === "NO_SHOW" ? t("bk.noShowConfirm") : undefined} />
                ))}
              </div>
            )}
          </section>

          <section className={card}>
            <h2 className={h2}>{t("bk.col.rooms")}</h2>
            <ul className="space-y-3">
              {b.rooms.map((r) => (
                <li key={r.id} className={`rounded-xl p-3 ring-1 ring-ink-100 ${r.active ? "" : "opacity-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span><strong>{t("bk.room")} {r.room.number}</strong> · {tr(r.room.roomType.name, L)} · {r.adults}+{r.children}{r.active ? "" : ` · ${t("bk.released")}`}</span>
                    <span className="tabular-nums text-ink-500">{r.nightlyPrices.map((p) => (p / 100).toFixed(0)).join(" · ")} GEL{r.extraGuestTotal ? ` + ${t("bk.extraGuests")} ${money(r.extraGuestTotal)}` : ""}</span>
                  </div>
                  {r.active && editable && (
                    <AdminForm action={adminMoveRoom} submit={t("bk.move")} tone="ghost" className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="code" value={b.code} /><input type="hidden" name="allocationId" value={r.id} />
                      <label className="text-xs text-ink-500">{t("bk.moveTo")}<select name="roomId" defaultValue={r.roomId} className={`${fld} !w-auto`}>{rooms.map((x) => <option key={x.id} value={x.id}>{x.number} · {tr(x.roomType.name, L)}{x.housekeeping === "OUT_OF_ORDER" ? ` (${t("bk.outOfOrder")})` : ""}</option>)}</select></label>
                    </AdminForm>
                  )}
                </li>
              ))}
            </ul>
            {editable && active.length > 0 && (
              <AdminForm action={adminChangeDates} submit={t("bk.changeDates")} tone="ghost" className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink-100 pt-4">
                <input type="hidden" name="code" value={b.code} />
                <label className="text-xs text-ink-500">{t("bk.checkIn")}<input type="date" name="checkIn" defaultValue={iso(b.checkIn)} className={fld} /></label>
                <label className="text-xs text-ink-500">{t("bk.checkOut")}<input type="date" name="checkOut" defaultValue={iso(b.checkOut)} className={fld} /></label>
              </AdminForm>
            )}
          </section>

          <section className={card}>
            <h2 className={h2}>{t("bk.price")}</h2>
            <dl className="space-y-1 text-sm">
              {q?.rooms?.map((r, i) => <div key={i} className="flex justify-between"><dt>{t("bk.room")} {i + 1} · {t("bk.nights", { n: q.nightsCount })}</dt><dd className="tabular-nums">{money(r.roomTotal + r.extraGuestTotal)}</dd></div>)}
              {b.extras.map((e) => <div key={e.id} className="flex justify-between"><dt>{tr(e.extra.name, L)} ×{e.quantity}</dt><dd className="tabular-nums">{money(e.total)}</dd></div>)}
              {b.discountTotal > 0 && <div className="flex justify-between text-sea-800"><dt>{t("bk.discount")} {b.promoCode?.code}</dt><dd>−{money(b.discountTotal)}</dd></div>}
              {b.taxTotal > 0 && <div className="flex justify-between"><dt>{t("bk.cityTax")}</dt><dd>{money(b.taxTotal)}</dd></div>}
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold"><dt>{t("bk.col.total")}</dt><dd className="tabular-nums">{money(b.grandTotal)}</dd></div>
              <div className="flex justify-between"><dt>{t("bk.paid")}</dt><dd className="tabular-nums">{money(b.amountPaid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>{t("bk.balance")}</dt><dd className="tabular-nums">{money(Math.max(0, b.grandTotal - b.amountPaid))}</dd></div>
            </dl>
            <h3 className="mt-4 font-sans text-sm font-semibold">{t("bk.payments")}</h3>
            <ul className="mt-1 space-y-1 text-xs text-ink-700">
              {b.payments.length === 0 && <li className="text-ink-500">{t("bk.noPayments")}{b.paymentPlan === "pay_at_hotel" ? ` — ${t("bk.plan.pay_at_hotel")}` : ""}</li>}
              {b.payments.map((p) => <li key={p.id} className="flex justify-between gap-2"><span>{stamp(p.createdAt)} · {t.has(`bk.method.${p.provider}`) ? t(`bk.method.${p.provider}`) : p.provider} · {t.has(`bk.payStatus.${p.status}`) ? t(`bk.payStatus.${p.status}`) : p.status}</span><span className="tabular-nums">{money(p.amount)}</span></li>)}
            </ul>
            {!["CANCELLED", "EXPIRED"].includes(b.status) && (
              <AdminForm action={adminRecordPayment} submit={t("bk.recordPayment")} className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink-100 pt-4">
                <input type="hidden" name="code" value={b.code} />
                <label className="text-xs text-ink-500">{t("bk.amount")}<input name="amount" inputMode="decimal" defaultValue={(Math.max(0, b.grandTotal - b.amountPaid) / 100).toFixed(2)} className={`${fld} !w-32`} /></label>
                <label className="text-xs text-ink-500">{t("bk.methodLabel")}<select name="method" className={`${fld} !w-auto`}>{["cash", "card_terminal", "bank_transfer"].map((m) => <option key={m} value={m}>{t(`bk.method.${m}`)}</option>)}</select></label>
              </AdminForm>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className={card} data-testid="booking-helpers">
            <h2 className={h2}>{t("bk.helpers")}</h2>
            <div className="space-y-2 text-sm">
              {(["registration", "invoice"] as const).map((doc) => (
                <p key={doc} className="flex flex-wrap items-center gap-2">
                  <FileDown size={16} className="text-sea-700" aria-hidden /><span className="font-medium">{t(`bk.doc.${doc}`)}</span>
                  {["ka", "en", "ru"].map((l) => <a key={l} href={`/admin/bookings/${encodeURIComponent(b.code)}/${doc}?lang=${l}`} target="_blank" rel="noopener" className="rounded-full px-2 py-0.5 text-xs font-semibold text-sea-700 ring-1 ring-ink-100 hover:bg-mist">{l.toUpperCase()}</a>)}
                </p>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-ink-100 pt-3">
              {wa && <a href={wa} target="_blank" rel="noopener" className="btn !min-h-10 bg-[#25D366] text-sm text-ink-950"><MessageCircle size={16} aria-hidden /> WhatsApp</a>}
              {["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(b.status) && <AdminForm action={adminResendConfirmation} submit={t("bk.resend")} tone="ghost"><input type="hidden" name="code" value={b.code} /></AdminForm>}
            </div>
            {(b.reminderSentAt || b.reviewRequestSentAt) && (
              <p className="mt-2 text-xs text-ink-500">
                {b.reminderSentAt && <>{t("bk.reminderSent", { at: stamp(b.reminderSentAt) })}<br /></>}
                {b.reviewRequestSentAt && t("bk.reviewSent", { at: stamp(b.reviewRequestSentAt) })}
              </p>
            )}
          </section>
          {terms && (
            <section className={card}>
              <h2 className={h2}>{t("bk.cancelTitle")}</h2>
              <p className="text-sm text-ink-700">{terms.freeCancellation ? t("bk.freeCancel", { deadline: terms.deadline }) : t("bk.lateCancel", { fee: money(terms.penalty) })} {t("bk.refundLine", { paid: money(b.amountPaid), refund: money(terms.refund) })}</p>
              <AdminForm action={adminCancel} submit={t("bk.cancelTitle")} tone="danger" confirm={t("bk.cancelConfirm")} className="mt-3 space-y-2 text-sm">
                <input type="hidden" name="code" value={b.code} />
                <input name="reason" placeholder={t("bk.reasonInternal")} className="field !min-h-10 !py-1.5 text-sm" />
                <fieldset className="space-y-1">
                  <label className="flex gap-2"><input type="radio" name="refundMode" value="policy" defaultChecked /> {t("bk.refundPolicy", { amount: money(terms.refund) })}</label>
                  <label className="flex gap-2"><input type="radio" name="refundMode" value="none" /> {t("bk.refundNone")}</label>
                  <label className="flex items-center gap-2"><input type="radio" name="refundMode" value="custom" /> {t("bk.refundCustom")} <input name="refundAmount" inputMode="decimal" className="field !min-h-8 !w-28 !py-1 text-sm" placeholder="GEL" /></label>
                </fieldset>
                <label className="flex gap-2"><input type="checkbox" name="refundOnline" defaultChecked /> {t("bk.refundOnline")}</label>
                <label className="flex gap-2"><input type="checkbox" name="notifyGuest" defaultChecked /> {t("bk.emailGuest")}</label>
              </AdminForm>
            </section>
          )}
          <section className={card}>
            <h2 className={h2}>{t("common.notes")}</h2>
            <AdminForm action={adminAddNote} submit={t("bk.addNote")} tone="ghost" resetOnSuccess>
              <input type="hidden" name="code" value={b.code} />
              <textarea name="body" rows={2} className="field text-sm" placeholder={t("bk.notePlaceholder")} />
            </AdminForm>
            <ul className="mt-3 space-y-2 text-sm">
              {b.notes.map((n) => <li key={n.id} className="rounded-lg bg-mist p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-ink-500">{n.user?.name ?? t("bk.system")} · {stamp(n.createdAt)}</p></li>)}
            </ul>
          </section>
          <section className={card}>
            <h2 className={h2}>{t("nav.activity")}</h2>
            <ul className="space-y-1.5 text-xs">
              {activity.map((a) => <li key={a.id}><span className="text-ink-500">{stamp(a.createdAt)}</span> · <strong>{a.user?.name ?? t("bk.guestOrSystem")}</strong> · {a.summary ?? a.action}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </AdminFrame>
  );
}

export default function BookingDetailPage({ params }: PageProps<"/admin/bookings/[code]">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Detail params={params} /></Suspense>;
}
