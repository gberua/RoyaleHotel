import { getTranslations } from "next-intl/server";
import type { FullBooking } from "@/lib/booking/load";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";

/** Read-only booking details (confirmation, return-from-payment and Manage booking pages). */
export async function BookingSummary({ b, locale }: { b: FullBooking; locale: string }) {
  const t = await getTranslations({ locale });
  const money = (n: number) => formatMoney(n, undefined, locale);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const statusTone: Record<string, string> = { CONFIRMED: "bg-sea-100 text-sea-900", CHECKED_IN: "bg-emerald-100 text-emerald-900", PENDING: "bg-amber-100 text-amber-900", CANCELLED: "bg-ink-100 text-ink-700", EXPIRED: "bg-ink-100 text-ink-700" };
  return (
    <dl className="divide-y divide-ink-100 rounded-2xl bg-white text-sm ring-1 ring-ink-100">
      <div className="flex items-center justify-between gap-3 p-4">
        <div><dt className="text-xs uppercase tracking-wide text-ink-500">{t("checkout.codeLabel")}</dt><dd className="text-2xl font-bold tracking-wide text-sea-800" data-testid="booking-code">{b.code}</dd></div>
        <dd className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[b.status] ?? "bg-mist"}`} data-testid="booking-status">{t(`bookingStatus.${b.status}` as "bookingStatus.CONFIRMED")}</dd>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <div><dt className="text-ink-500">{t("email.checkIn")}</dt><dd className="font-semibold">{iso(b.checkIn)}</dd></div>
        <div><dt className="text-ink-500">{t("email.checkOut")}</dt><dd className="font-semibold">{iso(b.checkOut)}</dd></div>
      </div>
      <div className="p-4">
        <dt className="text-ink-500">{t("manageBooking.rooms")}</dt>
        {b.rooms.map((r) => <dd key={r.id} className="font-semibold">{tr(r.room.roomType.name, locale)} <span className="font-normal text-ink-500">· {t("checkout.guestsSummary", { adults: r.adults, children: r.children })}</span></dd>)}
      </div>
      {b.extras.length > 0 && <div className="p-4"><dt className="text-ink-500">{t("email.extras")}</dt>{b.extras.map((e) => <dd key={e.id}>{tr(e.extra.name, locale)} ×{e.quantity}</dd>)}</div>}
      <div className="space-y-1 p-4">
        <div className="flex justify-between"><dt>{t("manageBooking.total")}</dt><dd className="font-semibold tabular-nums">{money(b.grandTotal)}</dd></div>
        <div className="flex justify-between"><dt>{t("manageBooking.paid")}</dt><dd className="tabular-nums">{money(b.amountPaid)}</dd></div>
        {!["CANCELLED", "EXPIRED"].includes(b.status) && <div className="flex justify-between text-ink-700"><dt>{t("manageBooking.balance")}</dt><dd className="tabular-nums">{money(Math.max(0, b.grandTotal - b.amountPaid))}</dd></div>}
      </div>
    </dl>
  );
}
