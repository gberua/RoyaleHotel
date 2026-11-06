/** Calendar-date helpers. Stay dates are plain "YYYY-MM-DD" strings handled in UTC (no time-zone drift). */
export const DAY = 86_400_000;
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
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
/** Friday and Saturday nights are weekend nights. */
export const isWeekendNight = (iso: string) => [5, 6].includes(toDate(iso).getUTCDay());
/** Georgia (Asia/Tbilisi) is UTC+4 all year — no daylight saving time. */
const TBILISI_OFFSET_MS = 4 * 3_600_000;
/** Today in Georgia as ISO date. */
export const todayInGeorgia = (now = Date.now()) => toIso(new Date(now + TBILISI_OFFSET_MS));
/** Local Tbilisi date and "HH:MM" time. */
export function nowInGeorgia(now = Date.now()) {
  const local = new Date(now + TBILISI_OFFSET_MS).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
