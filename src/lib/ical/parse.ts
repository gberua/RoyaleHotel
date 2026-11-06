/** Minimal RFC 5545 parser for OTA availability feeds (Booking.com, Airbnb, Expedia): VEVENT date ranges. */
export type IcalEvent = { uid: string; start: string; end: string; summary: string };

const toIso = (v: string) => {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export function parseIcal(text: string): IcalEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const events: IcalEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur && cur.DTSTART && (cur.STATUS ?? "").toUpperCase() !== "CANCELLED") {
        const start = toIso(cur.DTSTART);
        let end = cur.DTEND ? toIso(cur.DTEND) : null;
        if (start) {
          if (!end || end <= start) end = new Date(Date.parse(`${start}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
          events.push({ uid: cur.UID || `${start}_${end}`, start, end, summary: cur.SUMMARY ?? "" });
        }
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.slice(0, idx).split(";")[0].toUpperCase();
        if (!(key in cur)) cur[key] = line.slice(idx + 1).replace(/\\,/g, ",").replace(/\\n/gi, " ");
      }
    }
  }
  return events;
}

export function buildIcal(name: string, events: { uid: string; start: string; end: string; summary: string }[]) {
  const d = (iso: string) => iso.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`);
  const body = events.map((e) => [
    "BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${d(e.end)}`, `SUMMARY:${esc(e.summary)}`, "END:VEVENT",
  ].join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Royale Hotel//Booking//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, ...body, "END:VCALENDAR", ""].join("\r\n");
}

/** Collapse a sorted list of blocked nights into [start, end) ranges. */
export function nightsToRanges(nights: string[]) {
  const out: { start: string; end: string }[] = [];
  const next = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  for (const n of [...nights].sort()) {
    const last = out.at(-1);
    if (last && last.end === n) last.end = next(n);
    else out.push({ start: n, end: next(n) });
  }
  return out;
}
