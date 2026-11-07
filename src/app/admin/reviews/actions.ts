"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { diff, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { isIsoDate, toDate } from "@/lib/booking/dates";
import { refreshSite } from "@/lib/revalidate";
import { REVIEW_SOURCES, REVIEW_STATUSES } from "@/lib/reviews";

const LOCALES = ["ka", "en", "ru"] as const;

const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const rec = (x: object) => x as unknown as Record<string, unknown>;

/** Add a review by hand (e.g. copied from Google) or edit one, including the hotel's public reply. */
export async function saveReview(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("reviews", async (user) => {
    const id = String(form.get("id") ?? "");
    const f = z.object({
      source: z.enum(REVIEW_SOURCES),
      status: z.enum(REVIEW_STATUSES),
      authorName: z.string().trim().min(1).max(80),
      country: optText(60),
      rating: z.coerce.number().int().min(1).max(5),
      title: optText(120),
      body: z.string().trim().min(1).max(4000),
      reply: optText(2000),
      locale: z.union([z.literal(""), z.enum(LOCALES)]).optional().transform((v) => v || null),
      publishedAt: z.union([z.literal(""), z.string().refine(isIsoDate, "invalid_date")]).optional().transform((v) => (v ? toDate(v) : null)),
    }).parse(Object.fromEntries(form));
    const data = { ...f, featured: form.get("featured") === "on", publishedAt: f.publishedAt ?? (f.status === "APPROVED" ? new Date() : null) };
    if (id) {
      const before = await db.review.findUniqueOrThrow({ where: { id } });
      await db.review.update({ where: { id }, data });
      const d = diff(rec(before), rec({ ...before, ...data }));
      await logActivity({ userId: user.id, action: "review.update", entity: "Review", entityId: id, summary: `Review by ${f.authorName} updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
      refreshSite("reviews");
      return { ok: true, message: "saved" };
    }
    const r = await db.review.create({ data });
    await logActivity({ userId: user.id, action: "review.create", entity: "Review", entityId: r.id, summary: `Review by ${f.authorName} added (${f.source}, ${f.rating}★)`, after: data });
    refreshSite("reviews");
    return { ok: true, message: "created" };
  });
}

/** Approve (publish), reject (hide) or move back to pending. */
export async function setReviewStatus(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("reviews", async (user) => {
    const id = String(form.get("id"));
    const status = z.enum(REVIEW_STATUSES).parse(form.get("status"));
    const before = await db.review.findUniqueOrThrow({ where: { id } });
    // first approval stamps the publish date so a new review is listed as the newest
    await db.review.update({ where: { id }, data: { status, ...(status === "APPROVED" && !before.publishedAt ? { publishedAt: new Date() } : {}) } });
    await logActivity({ userId: user.id, action: `review.${status.toLowerCase()}`, entity: "Review", entityId: id, summary: `Review by ${before.authorName}: ${before.status} → ${status}`, before: { status: before.status }, after: { status } });
    refreshSite("reviews");
    return { ok: true, message: "status_changed" };
  });
}

/** Featured reviews are listed first; the home page shows the top four. */
export async function setReviewFeatured(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("reviews", async (user) => {
    const id = String(form.get("id"));
    const featured = form.get("featured") === "true";
    const r = await db.review.update({ where: { id }, data: { featured } });
    await logActivity({ userId: user.id, action: featured ? "review.feature" : "review.unfeature", entity: "Review", entityId: id, summary: `Review by ${r.authorName} ${featured ? "featured" : "no longer featured"}`, before: { featured: !featured }, after: { featured } });
    refreshSite("reviews");
  });
}

export async function deleteReview(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("reviews", async (user) => {
    const id = String(form.get("id"));
    const r = await db.review.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "review.delete", entity: "Review", entityId: id, summary: `Review by ${r.authorName} deleted`, before: rec(r) });
    refreshSite("reviews");
    return { ok: true, message: "deleted" };
  });
}
