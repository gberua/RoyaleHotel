import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { db } from "@/lib/db";
import { exportRoomTypeIcal, syncIcalFeed } from "@/lib/ical/sync";
import { holdRooms } from "@/lib/booking/service";
import { parseIcal } from "@/lib/ical/parse";
import { addDaysIso, todayInGeorgia } from "@/lib/booking/dates";

const d = (n: number) => addDaysIso(todayInGeorgia(), n);
const compact = (iso: string) => iso.replace(/-/g, "");
let feedBody = "";
let server: Server;
let url = "";
let typeId = "";

beforeAll(async () => {
  server = createServer((_req, res) => { res.setHeader("Content-Type", "text/calendar"); res.end(feedBody); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/feed.ics`;
  await db.$executeRawUnsafe(`TRUNCATE "RoomAllocation","BookingExtra","Payment","BookingNote","Booking","Guest","Room","RoomTypePhoto","RoomTypeAmenity","SeasonRate","Season","RateOverride","RoomType","OccupancyRule","Extra","PromoCode","Setting","BookingSequence","IcalFeed" CASCADE`);
  const rt = await db.roomType.create({ data: { slug: "ical", name: { en: "iCal room" }, basePrice: 10000 } });
  await db.room.createMany({ data: [{ number: "I1", roomTypeId: rt.id }, { number: "I2", roomTypeId: rt.id }] });
  typeId = rt.id;
});
afterAll(async () => { server.close(); await db.$disconnect(); });

const event = (uid: string, a: string, b: string) => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${compact(a)}\r\nDTEND;VALUE=DATE:${compact(b)}\r\nSUMMARY:Booked\r\nEND:VEVENT\r\n`;
const cal = (...e: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${e.join("")}END:VCALENDAR\r\n`;

describe("channel sync", () => {
  it("imports OTA reservations as room blocks so the website cannot sell them, and exports sold-out nights", async () => {
    const feed = await db.icalFeed.create({ data: { channel: "booking_com", roomTypeId: typeId, importUrl: url } });
    feedBody = cal(event("bcom-1", d(30), d(33)), event("bcom-2", d(30), d(32)));
    const r = await syncIcalFeed(feed.id);
    expect(r.imported).toBe(2);
    expect(r.conflicts).toEqual([]);
    // both rooms taken on d30–d31 → the website can't sell that type
    await expect(holdRooms({ checkIn: d(30), checkOut: d(31), lines: [{ roomTypeId: typeId, adults: 1, childAges: [] }], locale: "en" })).rejects.toMatchObject({ code: "sold_out" });
    // export shows the type as unavailable exactly while both rooms are taken (d30, d31)
    const exported = parseIcal(await exportRoomTypeIcal(typeId));
    expect(exported.map((e) => [e.start, e.end])).toEqual([[d(30), d(32)]]);
    // re-sync is idempotent
    expect((await syncIcalFeed(feed.id)).imported).toBe(0);
    expect(await db.roomAllocation.count({ where: { icalFeedId: feed.id, active: true } })).toBe(2);
  });

  it("releases blocks removed from the feed and reports overbookings instead of double-booking", async () => {
    const feed = (await db.icalFeed.findFirst({ where: { roomTypeId: typeId } }))!;
    feedBody = cal(event("bcom-1", d(30), d(33)), event("bcom-3", d(30), d(31)), event("bcom-4", d(30), d(31)));
    const r = await syncIcalFeed(feed.id);
    // bcom-2 disappeared → released; bcom-3 fits in the freed room; bcom-4 has no room left → conflict, not a double booking
    expect(r.imported).toBe(1);
    expect(r.conflicts).toHaveLength(1);
    expect((await db.icalFeed.findUniqueOrThrow({ where: { id: feed.id } })).lastError).toMatch(/Overbooking/);
    const overlaps = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "RoomAllocation" a JOIN "RoomAllocation" b ON a."roomId" = b."roomId" AND a.id < b.id AND a.active AND b.active
      AND daterange(a."checkIn", a."checkOut") && daterange(b."checkIn", b."checkOut")`;
    expect(Number(overlaps[0].n)).toBe(0);
  });
});
