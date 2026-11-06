"use client";
import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { lookupBooking, guestCancelBooking } from "@/actions/guest-booking";

export function LookupForm({ code }: { code?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, action, pending] = useActionState(lookupBooking, {});
  return (
    <form action={action} className="grid gap-4 rounded-[var(--radius-card)] bg-mist p-6">
      <input type="hidden" name="locale" value={locale} />
      <div><label className="label" htmlFor="m-code">{t("manage.code")}</label><input id="m-code" name="code" defaultValue={code} required className="field uppercase" placeholder="RH-2026-0001" autoComplete="off" /></div>
      <div><label className="label" htmlFor="m-email">{t("manage.email")}</label><input id="m-email" name="email" type="email" required className="field" autoComplete="email" /></div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error === "rate_limited" ? t("checkout.err.rate_limited") : t("manageBooking.notFound")}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? t("checkout.processing") : t("manage.find")}</button>
    </form>
  );
}

export function CancelPanel({ bookingId, refund, refundLabel, penaltyLabel, free }: { bookingId: string; refund: number; refundLabel: string; penaltyLabel: string; free: string | null }) {
  const t = useTranslations("manageBooking");
  const [state, action, pending] = useActionState(guestCancelBooking, {});
  const [confirming, setConfirming] = useState(false);
  if (state.done) return <p role="status" className="rounded-2xl bg-sea-50 p-4 font-semibold text-sea-900" data-testid="cancelled-message">{t("cancelled")}</p>;
  return (
    <section className="rounded-2xl p-5 ring-1 ring-ink-100">
      <h2 className="font-sans text-lg font-semibold">{t("cancelTitle")}</h2>
      <p className="mt-2 text-sm text-ink-700">{free ?? penaltyLabel}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900" data-testid="refund-amount">{refundLabel}</p>
      {state.error && <p role="alert" className="mt-2 text-sm text-danger">{t("cannotCancel")}</p>}
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="btn btn-ghost mt-4">{t("confirmCancel")}</button>
      ) : (
        <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="booking" value={bookingId} />
          <input type="hidden" name="refund" value={refund} />
          <span className="text-sm text-ink-700">{t("confirmQuestion")}</span>
          <button className="btn !min-h-10 bg-danger text-white hover:bg-red-800" disabled={pending}>{t("confirmCancel")}</button>
        </form>
      )}
    </section>
  );
}
