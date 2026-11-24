/** Calendar-date helpers. Stay dates are plain "YYYY-MM-DD" strings handled in UTC (no time-zone drift). */
export const DAY = 86_400_000;
/** A real calendar date: "2027-02-31" is refused (JavaScript would silently roll it over to 3 March). */
export const isIsoDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00.000Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};
export const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysIso = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * DAY));
export const nightsBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
/** Each night of a stay, as ISO dates (check-in … day before check-out). */
export function eachNight(checkIn: string, checkOut: string) {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDaysIso(d, 1)) out.push(d);
  return out;
}
/** A calendar date as people write it in their language: "31 December 2026", "31 დეკემბერი, 2026". */
export const longDate = (iso: string, locale: string) => (isIsoDate(iso) ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(toDate(iso)) : iso);
/** Friday and Saturday nights are weekend nights. */
export const isWeekendNight = (iso: string) => [5, 6].includes(toDate(iso).getUTCDay());
/** Georgia (Asia/Tbilisi) is UTC+4 all year — no daylight saving time. */
const TBILISI_OFFSET_MS = 4 * 3_600_000;
/** Today in Georgia as ISO date. */
export const todayInGeorgia = (now = Date.now()) => toIso(new Date(now + TBILISI_OFFSET_MS));
/** A moment shown to staff as hotel-local "YYYY-MM-DD HH:MM". */
export const stampInGeorgia = (d: Date) => new Date(d.getTime() + TBILISI_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
/** Local Tbilisi date and "HH:MM" time. */
export function nowInGeorgia(now = Date.now()) {
  const local = new Date(now + TBILISI_OFFSET_MS).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
