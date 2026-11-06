"use client";
import { useMessages } from "next-intl";
import { toDate } from "./dates";

type Names = { months: string[]; monthsShort: string[]; weekdays: string[]; weekdaysShort: string[] };

/**
 * Month / weekday names from our own translation files — not from Intl, because several
 * browsers (notably Chrome on Android) ship without Georgian locale data.
 */
export function useCalendarNames() {
  const n = (useMessages() as unknown as { calendar: Names }).calendar;
  const dow = (iso: string) => (toDate(iso).getUTCDay() + 6) % 7; // Monday = 0
  return {
    weekdaysShort: n.weekdaysShort,
    month: (iso: string) => `${n.months[toDate(iso).getUTCMonth()]} ${iso.slice(0, 4)}`,
    /** "შაბ, 14 ნოე" style short label */
    short: (iso: string) => `${n.weekdaysShort[dow(iso)]}, ${Number(iso.slice(8))} ${n.monthsShort[toDate(iso).getUTCMonth()]}`,
    /** Full accessible label: "შაბათი, 14 ნოემბერი 2026" */
    long: (iso: string) => `${n.weekdays[dow(iso)]}, ${Number(iso.slice(8))} ${n.months[toDate(iso).getUTCMonth()]} ${iso.slice(0, 4)}`,
  };
}
