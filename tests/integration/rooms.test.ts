/** The real room list (scripts/live-rooms.ts) against the PostgreSQL test database. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rebuildRooms } from "../../scripts/live-rooms";
import { plannedRooms } from "../../scripts/lib/room-plan";

const counts = async () =>
  Object.fromEntries(
    (await db.roomType.findMany({ include: { _count: { select: { rooms: true } } } })).map((r) => [r.slug, r._count.rooms]),
  );

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "RoomAllocation","Room","RoomTypePhoto","RoomType","Media","Season","Amenity","PromoCode" CASCADE`);
  const wifi = await db.amenity.create({ data: { key: "room-wifi", icon: "Wifi", name: { en: "Wi-Fi" } } });
  const double = await db.roomType.create({
    data: { slug: "standard-double", name: { en: "Standard Double" }, basePrice: 20000, weekendPrice: 22000, amenities: { create: { amenityId: wifi.id } } },
  });
  const twin = await db.roomType.create({ data: { slug: "twin", name: { en: "Twin" }, basePrice: 18000 } });
  await db.roomType.create({ data: { slug: "family-room", name: { en: "Family" }, basePrice: 30000, maxOccupancy: 4, view: "partial_sea", sizeM2: 34 } });
  await db.room.create({ data: { number: "101", floor: 1, roomTypeId: double.id } });
  await db.room.create({ data: { number: "801", floor: 8, roomTypeId: twin.id, housekeeping: "DIRTY" } });
  await db.season.create({
    data: { id: "high", name: { en: "High" }, startDate: new Date("2027-07-01"), endDate: new Date("2027-08-31"), rates: { create: { roomTypeId: double.id, price: 30000, weekendPrice: 33000, minStay: 3 } } },
  });
  await db.promoCode.create({ data: { code: "TWIN10", value: 10, roomTypeIds: [twin.id, double.id] } });
  for (const [i, file] of ["0L9A7245.JPG 2.jpg", "0L9A6747.jpg.jpg", "0L9A6958.jpg.jpg"].entries())
    await db.media.create({ data: { url: `/m/${i}.webp`, width: 8, height: 8, category: "room", sourceFile: `real/royal palace/${file}` } });
});
afterAll(() => db.$disconnect());

describe("real room list", () => {
  it("plans 59 rooms with unique numbers: 43 two-person, 6 three-person, 10 four-person", () => {
    const rooms = plannedRooms();
    const n = (slug: string) => rooms.filter((r) => r.slug === slug).length;
    expect([rooms.length, n("standard-double"), n("triple"), n("family-room")]).toEqual([59, 43, 6, 10]);
    expect(new Set(rooms.map((r) => r.number)).size).toBe(59);
    expect(rooms.filter((r) => r.floor === 8).map((r) => r.slug).sort().join()).toBe(
      [...Array(7).fill("standard-double"), "triple", "family-room", "family-room"].sort().join(),
    );
  });

  it("replaces the demo rooms and types, keeps prices, and can be run again", async () => {
    await rebuildRooms(db);
    expect(await counts()).toEqual({ "standard-double": 43, triple: 6, "family-room": 10 });

    const double = await db.roomType.findUniqueOrThrow({ where: { slug: "standard-double" } });
    expect([double.basePrice, double.maxOccupancy, (double.name as { en: string }).en]).toEqual([20000, 2, "Double Room"]);

    const triple = await db.roomType.findUniqueOrThrow({ where: { slug: "triple" }, include: { amenities: true, seasonRates: true, photos: { orderBy: { sortOrder: "asc" }, include: { media: true } } } });
    expect([triple.basePrice, triple.maxAdults, triple.maxOccupancy, triple.baseOccupancy]).toEqual([24000, 3, 3, 3]);
    expect(triple.amenities).toHaveLength(1);
    // season price follows the two-person room's season uplift (300 / 200 = 1.5)
    expect(triple.seasonRates.map((r) => [r.price, r.minStay])).toEqual([[36000, 3]]);
    expect(triple.photos.map((p) => p.media.sourceFile)).toEqual(["real/royal palace/0L9A7245.JPG 2.jpg", "real/royal palace/0L9A6747.jpg.jpg"]);

    const family = await db.roomType.findUniqueOrThrow({ where: { slug: "family-room" }, include: { photos: true, amenities: true } });
    expect([family.basePrice, family.maxOccupancy, family.photos.length]).toEqual([30000, 4, 1]);
    // demo claims (sea view, size) are gone and the equipment list matches the two-person room
    expect([family.view, family.sizeM2, family.amenities.length]).toEqual([null, null, 1]);

    // the room that keeps its number keeps its record; a promo code no longer points at a removed type
    const r801 = await db.room.findUniqueOrThrow({ where: { number: "801" }, include: { roomType: true } });
    expect([r801.roomType.slug, r801.housekeeping]).toEqual(["standard-double", "DIRTY"]);
    expect(await db.room.findUnique({ where: { number: "101" } })).toBeNull();
    expect((await db.promoCode.findUniqueOrThrow({ where: { code: "TWIN10" } })).roomTypeIds).toEqual([double.id]);

    await db.roomType.update({ where: { slug: "triple" }, data: { basePrice: 26000 } });
    await rebuildRooms(db);
    expect(await counts()).toEqual({ "standard-double": 43, triple: 6, "family-room": 10 });
    expect((await db.roomType.findUniqueOrThrow({ where: { slug: "triple" } })).basePrice).toBe(26000);
    expect(await db.seasonRate.count()).toBe(2);
  });

  it("refuses to touch anything while a room that would go has a booking or a block", async () => {
    const room = await db.room.findUniqueOrThrow({ where: { number: "101" } });
    await db.roomAllocation.create({ data: { roomId: room.id, checkIn: new Date("2027-07-01"), checkOut: new Date("2027-07-03"), kind: "MAINTENANCE" } });
    await expect(rebuildRooms(db)).rejects.toThrow(/101/);
    expect(await counts()).toEqual({ "standard-double": 1, twin: 1, "family-room": 0 });
  });
});
