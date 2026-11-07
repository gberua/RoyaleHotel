/**
 * Review moderation (Admin → Reviews): guest review → approve → on the website; hide; feature; add by hand; reply; delete.
 * Real PostgreSQL (test database). Server actions run with a mocked signed-in user, so the server-side role checks are exercised.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string; adminLocale: string } }));
vi.mock("@/lib/admin-auth", () => ({ currentStaff: async () => session.user, requirePermission: async () => session.user }));
vi.mock("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, revalidateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.20" }), cookies: async () => ({ get: () => undefined, set: () => {} }), draftMode: async () => ({ isEnabled: false }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` }); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/server", () => ({ after: () => {}, connection: async () => {} }));
vi.mock("@/auth", () => ({ signIn: async () => {}, signOut: async () => {}, auth: async () => null }));

import { db } from "@/lib/db";
import { getApprovedReviews } from "@/lib/data";
import { submitReview } from "@/actions/public";
import { deleteReview, saveReview, setReviewFeatured, setReviewStatus } from "@/app/admin/reviews/actions";

const users: Record<string, { id: string; name: string; email: string; role: string; adminLocale: string }> = {};
const as = (role: string) => { session.user = users[role]; };
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const ok = { ok: true } as const;
const guestReview = { authorName: "Mariam", country: "Georgia", rating: "5", body: "Lovely stay, two minutes from the beach and a great pool.", locale: "ka", website: "" };
const handReview = { source: "GOOGLE", status: "APPROVED", authorName: "Nino M", country: "", rating: "5", body: "Great place, with delicious food", reply: "", locale: "en", publishedAt: "2023-09-01", title: "" };

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "Review","RateLimit","ActivityLog","User" CASCADE`);
  for (const role of ["OWNER", "MANAGER", "RECEPTION", "HOUSEKEEPING"]) {
    const u = await db.user.create({ data: { email: `${role.toLowerCase()}@reviews.test`, name: role, role: role as never, passwordHash: "x", adminLocale: "en" } });
    users[role] = { id: u.id, name: u.name, email: u.email, role, adminLocale: "en" };
  }
});
afterAll(async () => { await db.$disconnect(); });

describe("review moderation", () => {
  it("a guest's review stays off the website until a manager approves it; hiding takes it off again", async () => {
    expect(await submitReview({ ok: false }, form(guestReview))).toEqual({ ok: true });
    const r = await db.review.findFirstOrThrow();
    expect(r).toMatchObject({ status: "PENDING", source: "DIRECT", publishedAt: null });
    expect(await getApprovedReviews()).toEqual([]);

    as("MANAGER");
    expect(await setReviewStatus(ok, form({ id: r.id, status: "APPROVED" }))).toMatchObject({ ok: true });
    const shown = await getApprovedReviews();
    expect(shown.map((x) => x.authorName)).toEqual(["Mariam"]);
    expect((await db.review.findUniqueOrThrow({ where: { id: r.id } })).publishedAt).not.toBeNull();

    expect(await setReviewStatus(ok, form({ id: r.id, status: "REJECTED" }))).toMatchObject({ ok: true });
    expect(await getApprovedReviews()).toEqual([]);
    expect(await db.activityLog.count({ where: { entity: "Review", entityId: r.id } })).toBe(2);
  });

  it("reception and housekeeping cannot moderate, add or delete reviews (checked on the server)", async () => {
    await submitReview({ ok: false }, form(guestReview));
    const r = await db.review.findFirstOrThrow();
    for (const role of ["RECEPTION", "HOUSEKEEPING"]) {
      as(role);
      expect(await setReviewStatus(ok, form({ id: r.id, status: "APPROVED" }))).toEqual({ ok: false, error: "forbidden" });
      expect(await saveReview(ok, form(handReview))).toEqual({ ok: false, error: "forbidden" });
      expect(await deleteReview(ok, form({ id: r.id }))).toEqual({ ok: false, error: "forbidden" });
    }
    expect(await db.review.count()).toBe(1);
    expect((await db.review.findFirstOrThrow()).status).toBe("PENDING");
  });

  it("adds a Google review by hand, validates it, and saves the hotel's public reply", async () => {
    as("OWNER");
    expect(await saveReview(ok, form({ ...handReview, rating: "6", body: "" }))).toMatchObject({ ok: false, error: "invalid_form", fieldErrors: { rating: expect.any(String), body: "required" } });
    expect(await db.review.count()).toBe(0);

    expect(await saveReview(ok, form(handReview))).toMatchObject({ ok: true, message: "created" });
    const r = await db.review.findFirstOrThrow();
    expect(r).toMatchObject({ source: "GOOGLE", status: "APPROVED", country: null, title: null, reply: null, featured: false });
    expect(r.publishedAt?.toISOString().slice(0, 10)).toBe("2023-09-01");

    expect(await saveReview(ok, form({ ...handReview, id: r.id, reply: "Thank you, Nino!" }))).toMatchObject({ ok: true, message: "saved" });
    expect((await getApprovedReviews())[0]).toMatchObject({ authorName: "Nino M", source: "GOOGLE", reply: "Thank you, Nino!", date: "2023-09-01" });
  });

  it("featured reviews come first on the website, then the newest", async () => {
    as("MANAGER");
    for (const [name, date] of [["Old", "2023-09-01"], ["Newer", "2025-10-01"], ["Newest", "2026-09-01"]]) await saveReview(ok, form({ ...handReview, authorName: name, publishedAt: date }));
    expect((await getApprovedReviews()).map((r) => r.authorName)).toEqual(["Newest", "Newer", "Old"]);
    const old = await db.review.findFirstOrThrow({ where: { authorName: "Old" } });
    expect(await setReviewFeatured(ok, form({ id: old.id, featured: "true" }))).toMatchObject({ ok: true });
    expect((await getApprovedReviews()).map((r) => r.authorName)).toEqual(["Old", "Newest", "Newer"]);
  });

  it("deletes a review and records who did it", async () => {
    as("OWNER");
    await saveReview(ok, form(handReview));
    const r = await db.review.findFirstOrThrow();
    expect(await deleteReview(ok, form({ id: r.id }))).toMatchObject({ ok: true, message: "deleted" });
    expect(await db.review.count()).toBe(0);
    expect(await db.activityLog.findFirst({ where: { action: "review.delete" } })).toMatchObject({ userId: users.OWNER.id, entityId: r.id });
  });
});
