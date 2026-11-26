/** Tours (information only): admin actions and the public loader against the PostgreSQL test database. */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string; adminLocale: string } }));
vi.mock("@/lib/admin-auth", () => ({ currentStaff: async () => session.user, requirePermission: async () => session.user }));
vi.mock("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, revalidateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  draftMode: async () => ({ isEnabled: false, enable: () => {}, disable: () => {} }),
}));

import { db } from "@/lib/db";
import { getTours } from "@/lib/data";
import { deleteTour, orderTours, saveTour } from "@/app/admin/content/actions";
import { deleteMedia } from "@/app/admin/media/actions";

const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const media: string[] = [];
const as = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}@tours.local`, name: role, role: role as never, passwordHash: "x", adminLocale: "en" } });
  session.user = { id: u.id, name: u.name, email: u.email, role, adminLocale: "en" };
};

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "Tour","Media","ActivityLog","User","Setting" CASCADE`);
  media.length = 0;
  for (let i = 0; i < 3; i++) media.push((await db.media.create({ data: { url: `/media/tour-test-${i}.webp`, width: 8, height: 8 } })).id);
});
afterAll(() => db.$disconnect());

describe("tours", () => {
  it("a manager adds a tour with a main photo and more photos; only published tours are shown, in order", async () => {
    await as("MANAGER");
    expect((await saveTour({ ok: true }, form({ "title.en": "Batumi day trip", "summary.en": "The boulevard and the old town", "duration.en": "Full day", mediaId: media[0], photoIds: [media[0], media[1], media[1], media[2]], active: "on" }))).ok).toBe(true);
    expect((await saveTour({ ok: true }, form({ "title.ka": "მთის ტური", "summary.ka": "მთები" }))).ok).toBe(true);
    expect((await saveTour({ ok: true }, form({ "title.en": "Waterfalls", "summary.en": "Makhuntseti", active: "on" }))).ok).toBe(true);

    const rows = await db.tour.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => [r.slug, r.active, r.sortOrder])).toEqual([["batumi-day-trip", true, 0], [rows[1].slug, false, 1], ["waterfalls", true, 2]]);
    // the main photo is not repeated among the extra photos, and duplicates are dropped
    expect(rows[0].photoIds).toEqual([media[1], media[2]]);

    await orderTours({ ok: true }, form({ order: [rows[2].id, rows[0].id, rows[1].id].join(",") }));
    const shown = await getTours();
    expect(shown.map((x) => x.slug)).toEqual(["waterfalls", "batumi-day-trip"]);
    expect([shown[1].image?.id, shown[1].photos.map((p) => p.id), shown[1].duration.en]).toEqual([media[0], [media[1], media[2]], "Full day"]);
    expect([shown[0].image, shown[0].photos]).toEqual([null, []]);

    expect((await deleteTour({ ok: true }, form({ id: rows[2].id }))).ok).toBe(true);
    expect(await db.tour.count()).toBe(2);
  });

  it("needs a title and a short description, and the content permission", async () => {
    await as("MANAGER");
    expect((await saveTour({ ok: true }, form({ "summary.en": "No title" }))).ok).toBe(false);
    expect((await saveTour({ ok: true }, form({ "title.en": "No summary" }))).ok).toBe(false);
    await as("HOUSEKEEPING");
    expect(await saveTour({ ok: true }, form({ "title.en": "X", "summary.en": "Y" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await db.tour.count()).toBe(0);
  });

  it("a photo used by a tour is not deleted silently; forcing removes it from the tour", async () => {
    await as("MANAGER");
    await saveTour({ ok: true }, form({ "title.en": "Batumi", "summary.en": "City", mediaId: media[0], photoIds: [media[1], media[2]], active: "on" }));
    expect(await deleteMedia({ ok: true }, form({ id: media[1] }))).toMatchObject({ ok: false, error: "in_use" });
    expect((await deleteMedia({ ok: true }, form({ id: media[1], force: "1" }))).ok).toBe(true);
    expect((await deleteMedia({ ok: true }, form({ id: media[0], force: "1" }))).ok).toBe(true);
    const tour = await db.tour.findFirstOrThrow();
    expect([tour.mediaId, tour.photoIds]).toEqual([null, [media[2]]]);
  });
});
