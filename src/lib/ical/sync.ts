import "server-only";
import { db } from "@/lib/db";
import { addDaysIso, eachNight, todayInGeorgia, toDate } from "@/lib/booking/dates";
import { logActivity } from "@/lib/booking/service";
import { sendTelegram } from "@/lib/notify/telegram";
import { buildIcal, nightsToRanges, parseIcal } from "./parse";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** iCal export for one room type: every night on which ALL its rooms are taken (any source) is blocked. */
export async function exportRoomTypeIcal(roomTypeId: string) {
  const rt = await db.roomType.findUniqueOrThrow({ where: { id: roomTypeId }, include: { rooms: { where: { active: true }, select: { id: true } } } });
  const from = todayInGeorgia();
  const to = addDaysIso(from, 500);
  const allocs = await db.roomAllocation.findMany({
    where: { roomId: { in: rt.rooms.map((r) => r.id) }, active: true, checkOut: { gt: toDate(from) }, checkIn: { lt: toDate(to) }, OR: [{ kind: { not: "HOLD" } }, { holdExpiresAt: { gt: new Date() } }] },
    select: { roomId: true, checkIn: true, checkOut: true },
  });
  const busy = new Map<string, Set<string>>();
  for (const a of allocs) for (const n of eachNight(iso(a.checkIn), iso(a.checkOut))) if (n >= from) (busy.get(n) ?? busy.set(n, new Set()).get(n)!).add(a.roomId);
  const soldOut = [...busy.entries()].filter(([, rooms]) => rooms.size >= rt.rooms.length).map(([n]) => n);
  const events = nightsToRanges(soldOut).map((r) => ({ uid: `${rt.slug}-${r.start}@royalehotel`, start: r.start, end: r.end, summary: "Not available" }));
  return buildIcal(`Royale Hotel — ${(rt.name as Record<string, string>).en ?? rt.slug}`, events);
}

async function fetchFeed(url: string) {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http(s) iCal URLs are allowed");
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "RoyaleHotel-iCal/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 3_000_000) throw new Error("Feed too large");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Not an iCal feed");
  return text;
}

/**
 * Import one feed: each external reservation occupies a physical room (EXTERNAL allocation), so the website
 * can't sell it. Events that disappeared from the feed are released. If no room is free, it's an overbooking
 * the hotel must resolve → alert + error shown in the admin.
 */
export async function syncIcalFeed(feedId: string) {
  const feed = await db.icalFeed.findUniqueOrThrow({ where: { id: feedId } });
  if (!feed.importUrl || !feed.active) return { imported: 0, released: 0, conflicts: [] as string[] };
  try {
    const today = todayInGeorgia();
    const events = parseIcal(await fetchFeed(feed.importUrl)).filter((e) => e.end > today);
    const roomIds = feed.roomId
      ? [feed.roomId]
      : (await db.room.findMany({ where: { roomTypeId: feed.roomTypeId!, active: true }, select: { id: true }, orderBy: { number: "asc" } })).map((r) => r.id);
    const conflicts: string[] = [];
    let imported = 0;
    let released = 0;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ANY(${roomIds}::text[]) ORDER BY id FOR UPDATE`;
      const existing = await tx.roomAllocation.findMany({ where: { icalFeedId: feed.id, active: true } });
      const byUid = new Map(existing.map((a) => [a.externalUid, a]));
      // 1) release reservations that disappeared from the feed FIRST, so their rooms can be reused below
      const seen = new Set(events.map((e) => e.uid));
      const gone = existing.filter((a) => !seen.has(a.externalUid ?? ""));
      if (gone.length) await tx.roomAllocation.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { active: false } });
      released = gone.length;
      // 2) add new / changed reservations
      for (const ev of events) {
        const cur = byUid.get(ev.uid);
        if (cur && iso(cur.checkIn) === ev.start && iso(cur.checkOut) === ev.end) continue;
        if (cur) await tx.roomAllocation.update({ where: { id: cur.id }, data: { active: false } });
        const overlapping = await tx.roomAllocation.findMany({
          where: { roomId: { in: roomIds }, active: true, checkIn: { lt: toDate(ev.end) }, checkOut: { gt: toDate(ev.start) }, OR: [{ kind: { not: "HOLD" } }, { holdExpiresAt: { gt: new Date() } }] },
          select: { roomId: true },
        });
        const busy = new Set(overlapping.map((o) => o.roomId));
        const roomId = roomIds.find((id) => !busy.has(id));
        if (!roomId) {
          conflicts.push(`${ev.start} → ${ev.end} (${ev.summary || ev.uid})`);
          continue;
        }
        await tx.roomAllocation.create({ data: { roomId, roomTypeId: feed.roomTypeId, checkIn: toDate(ev.start), checkOut: toDate(ev.end), kind: "EXTERNAL", icalFeedId: feed.id, externalUid: ev.uid, note: `${feed.channel}: ${ev.summary}`.slice(0, 200) } });
        imported++;
      }
    }, { timeout: 30_000 });
    await db.icalFeed.update({ where: { id: feed.id }, data: { lastSyncAt: new Date(), lastCount: events.length, lastError: conflicts.length ? `Overbooking: no free room for ${conflicts.join("; ")}` : null } });
    if (conflicts.length) {
      await sendTelegram(`<b>⚠️ OVERBOOKING from ${feed.channel}</b>\nNo free room for:\n${conflicts.join("\n")}`);
      await logActivity({ action: "ical.conflict", entity: "IcalFeed", entityId: feed.id, summary: conflicts.join("; ") });
    }
    return { imported, released, conflicts };
  } catch (e) {
    await db.icalFeed.update({ where: { id: feed.id }, data: { lastSyncAt: new Date(), lastError: String((e as Error).message ?? e).slice(0, 300) } });
    return { imported: 0, released: 0, conflicts: [], error: String(e) };
  }
}

export async function syncAllIcalFeeds() {
  const feeds = await db.icalFeed.findMany({ where: { active: true, importUrl: { not: null } }, select: { id: true } });
  const results = [];
  for (const f of feeds) results.push({ id: f.id, ...(await syncIcalFeed(f.id)) });
  return results;
}
