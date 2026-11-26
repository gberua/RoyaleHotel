/**
 * npm run rooms:real — replaces the demo rooms with the hotel's real list (scripts/lib/room-plan.ts):
 * 59 rooms — 43 two-person, 6 three-person, 10 four-person.
 *
 * - Room types that are not in the list are removed together with their rooms.
 * - Prices are never changed: a new type gets a starting price, and its season prices follow the
 *   two-person room's season uplift. Set the real prices in Admin → Rooms and Rates.
 * - Names, texts and capacity of the listed types are reset to the list on every run; size and view are
 *   cleared and the equipment list is taken from the two-person room.
 * - Refuses to run while a room that would be removed still has a booking, hold or block.
 *
 * Pages are cached: redeploy (or save any room in the admin) after running this against the live database.
 */
import "dotenv/config";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { plannedRooms, ROOM_TYPES } from "./lib/room-plan";

type Db = PrismaClient;
const GEL = (n: number) => n * 100;
const SOURCE = "standard-double";

export async function rebuildRooms(db: Db) {
  const rooms = plannedRooms();
  const keep = new Set(rooms.map((r) => r.number));
  const slugs = ROOM_TYPES.map((r) => r.slug);

  const busy = await db.room.findMany({ where: { number: { notIn: [...keep] }, allocations: { some: {} } }, select: { number: true } });
  if (busy.length) throw new Error(`Rooms with bookings, holds or blocks would be removed: ${busy.map((r) => r.number).join(", ")}. Move or cancel them first.`);

  return db.$transaction(
    async (tx) => {
      const source = await tx.roomType.findUnique({ where: { slug: SOURCE }, include: { amenities: true, seasonRates: true } });
      const ids: Record<string, string> = {};

      for (const r of ROOM_TYPES) {
        const shared = {
          name: r.name, beds: r.beds, shortDescription: r.short, description: r.description,
          maxAdults: r.guests, maxChildren: r.guests - 1, maxOccupancy: r.guests, baseOccupancy: r.guests, extraBeds: 0,
          // size and view are not known yet: nothing is shown rather than the demo values
          sizeM2: null, view: null, sortOrder: r.sortOrder, featured: r.featured, active: true,
        };
        const existing = await tx.roomType.findUnique({ where: { slug: r.slug } });
        if (existing) {
          ids[r.slug] = (await tx.roomType.update({ where: { id: existing.id }, data: shared })).id;
          if (source && existing.id !== source.id) {
            // same equipment as the two-person room, instead of the demo type's own list
            await tx.roomTypeAmenity.deleteMany({ where: { roomTypeId: existing.id } });
            await tx.roomTypeAmenity.createMany({ data: source.amenities.map((a) => ({ roomTypeId: existing.id, amenityId: a.amenityId })) });
          }
          continue;
        }
        const created = await tx.roomType.create({
          data: {
            ...shared, slug: r.slug, basePrice: GEL(r.price), minStay: source?.minStay ?? 1,
            amenities: { create: (source?.amenities ?? []).map((a) => ({ amenityId: a.amenityId })) },
          },
        });
        ids[r.slug] = created.id;
        // season prices: the same uplift the two-person room has in that season, in whole GEL
        const scale = (price: number) => (source ? Math.round((price * created.basePrice) / source.basePrice / 100) * 100 : price);
        for (const s of source?.seasonRates ?? [])
          await tx.seasonRate.create({ data: { seasonId: s.seasonId, roomTypeId: created.id, price: scale(s.price), weekendPrice: s.weekendPrice == null ? null : scale(s.weekendPrice), minStay: s.minStay } });
      }

      for (const r of ROOM_TYPES) {
        if (!r.photos.length) continue;
        const found = [];
        for (const file of r.photos) {
          const m = await tx.media.findFirst({ where: { isDemo: false, sourceFile: { endsWith: `/${file}` } }, select: { id: true } });
          if (m) found.push(m.id);
        }
        if (!found.length) continue; // the real photos are not imported here: keep whatever the type shows now
        await tx.roomTypePhoto.deleteMany({ where: { roomTypeId: ids[r.slug] } });
        await tx.roomTypePhoto.createMany({ data: found.map((mediaId, sortOrder) => ({ roomTypeId: ids[r.slug], mediaId, sortOrder })) });
      }

      const removedRooms = await tx.room.deleteMany({ where: { number: { notIn: [...keep] } } });
      for (const r of rooms)
        await tx.room.upsert({
          where: { number: r.number },
          update: { floor: r.floor, roomTypeId: ids[r.slug], active: true },
          create: { number: r.number, floor: r.floor, roomTypeId: ids[r.slug] },
        });

      const gone = await tx.roomType.findMany({ where: { slug: { notIn: slugs } }, select: { id: true, slug: true } });
      const goneIds = gone.map((g) => g.id);
      for (const p of await tx.promoCode.findMany({ where: { roomTypeIds: { hasSome: goneIds } } }))
        await tx.promoCode.update({ where: { id: p.id }, data: { roomTypeIds: p.roomTypeIds.filter((id) => !goneIds.includes(id)) } });
      await tx.roomType.deleteMany({ where: { id: { in: goneIds } } });

      return { rooms: rooms.length, removedRooms: removedRooms.count, removedTypes: gone.map((g) => g.slug) };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  rebuildRooms(db)
    .then((r) => console.log(`rooms: ${r.rooms} in the list, ${r.removedRooms} old rooms removed, types removed: ${r.removedTypes.join(", ") || "none"}`))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
