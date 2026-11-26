"use server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ActionError, diff, localized, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { isIsoDate, toDate } from "@/lib/booking/dates";
import { HOME_SECTIONS, HOME_TEXTS } from "@/lib/content/home";
import { CONTENT_PAGES, FAQ_CATEGORIES } from "@/lib/content/pages";
import { slugify } from "@/lib/media/process";
import { revalidatePath } from "next/cache";
import { refreshSite } from "@/lib/revalidate";

const json = (v: unknown) => v as Prisma.InputJsonValue;
const rec = (v: unknown) => (v ?? {}) as Record<string, unknown>;
const optDate = z.union([z.literal(""), z.string().refine(isIsoDate, "invalid_date")]).optional().transform((v) => (v ? toDate(v) : null));
const adminRefresh = () => revalidatePath("/admin/content", "layout");
const done = () => { refreshSite("content", "offers"); adminRefresh(); };

// ───────────────────────────── Pages (draft → preview → publish) ─────────────────────────────

/** Saves the edits as a draft: the live site doesn't change until "Publish". */
export async function savePageDraft(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const key = z.enum(CONTENT_PAGES).parse(form.get("key"));
    const page = await db.page.findUnique({ where: { key } });
    const base = rec((page?.draft as { sections?: unknown } | null)?.sections ?? page?.sections);
    const sections: Record<string, unknown> = { ...base };
    const textKeys = key === "home" ? Object.values(HOME_TEXTS).flatMap((x) => Object.keys(x)) : key === "footer" ? ["tagline"] : ["title", "intro"];
    for (const k of textKeys) sections[k] = localized(form, k);
    if (key === "home") {
      const order = String(form.get("order") ?? "").split(",").filter((s) => (HOME_SECTIONS as readonly string[]).includes(s));
      sections.order = order.length ? order : [...HOME_SECTIONS];
      sections.hidden = form.getAll("hidden").map(String).filter((s) => (HOME_SECTIONS as readonly string[]).includes(s));
    }
    const draft = { sections, seoTitle: localized(form, "seoTitle"), seoDescription: localized(form, "seoDescription") };
    for (const l of ["ka", "en", "ru"] as const) if ((draft.seoDescription[l] ?? "").length > 300) throw new ActionError("seo_too_long");
    await db.page.upsert({ where: { key }, create: { key, sections: json(page?.sections ?? {}), draft: json(draft) }, update: { draft: json(draft) } });
    await logActivity({ userId: user.id, action: "page.draft", entity: "Page", entityId: key, summary: `Draft saved for page "${key}"` });
    adminRefresh();
    return { ok: true, message: "draft_saved" };
  });
}

export async function publishPage(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const key = z.enum(CONTENT_PAGES).parse(form.get("key"));
    const page = await db.page.findUnique({ where: { key } });
    if (!page?.draft) throw new ActionError("nothing_to_publish");
    const d = page.draft as { sections: unknown; seoTitle: unknown; seoDescription: unknown };
    await db.page.update({ where: { key }, data: { sections: json(d.sections), seoTitle: json(d.seoTitle), seoDescription: json(d.seoDescription), draft: Prisma.DbNull, publishedAt: new Date() } });
    const ch = diff({ sections: page.sections, seoTitle: page.seoTitle, seoDescription: page.seoDescription }, { sections: d.sections, seoTitle: d.seoTitle, seoDescription: d.seoDescription });
    await logActivity({ userId: user.id, action: "page.publish", entity: "Page", entityId: key, summary: `Page "${key}" published (${ch.changed.join(", ") || "no changes"})`, before: ch.before, after: ch.after });
    done();
    return { ok: true, message: "published" };
  });
}

export async function discardPageDraft(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const key = z.enum(CONTENT_PAGES).parse(form.get("key"));
    await db.page.update({ where: { key }, data: { draft: Prisma.DbNull } });
    await logActivity({ userId: user.id, action: "page.discard", entity: "Page", entityId: key, summary: `Draft of page "${key}" discarded` });
    adminRefresh();
    return { ok: true, message: "draft_discarded" };
  });
}

// ───────────────────────────── FAQ ─────────────────────────────

export async function saveFaq(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const id = String(form.get("id") ?? "");
    const data = {
      question: localized(form, "question", true), answer: localized(form, "answer", true),
      category: z.enum(FAQ_CATEGORIES).catch("general").parse(form.get("category")), active: form.get("active") === "on",
    };
    if (id) {
      const before = await db.faqItem.findUniqueOrThrow({ where: { id } });
      await db.faqItem.update({ where: { id }, data });
      const d = diff(rec(before), { ...before, ...data });
      await logActivity({ userId: user.id, action: "faq.update", entity: "FaqItem", entityId: id, summary: `FAQ "${data.question.en || data.question.ka}" updated`, before: d.before, after: d.after });
    } else {
      const f = await db.faqItem.create({ data: { ...data, sortOrder: await db.faqItem.count() } });
      await logActivity({ userId: user.id, action: "faq.create", entity: "FaqItem", entityId: f.id, summary: `FAQ "${data.question.en || data.question.ka}" added`, after: data });
    }
    done();
  });
}

export async function deleteFaq(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const f = await db.faqItem.delete({ where: { id: String(form.get("id")) } });
    await logActivity({ userId: user.id, action: "faq.delete", entity: "FaqItem", entityId: f.id, summary: `FAQ "${rec(f.question).en}" deleted`, before: rec(f) });
    done();
  });
}

const orderAction = (model: "faqItem" | "offer" | "attraction" | "tour" | "policy", idField: "id" | "slug") => async (_p: ActionResult, form: FormData): Promise<ActionResult> =>
  staffAction("content", async (user) => {
    const ids = String(form.get("order") ?? "").split(",").filter(Boolean);
    const delegate = db[model] as unknown as { update: (a: unknown) => Prisma.PrismaPromise<unknown> };
    await db.$transaction(ids.map((id, i) => delegate.update({ where: { [idField]: id }, data: { sortOrder: i } })));
    await logActivity({ userId: user.id, action: `${model}.order`, entity: model, summary: `${model} order changed`, after: { order: ids } });
    done();
  });

export async function orderFaq(p: ActionResult, form: FormData) { return orderAction("faqItem", "id")(p, form); }
export async function orderOffers(p: ActionResult, form: FormData) { return orderAction("offer", "id")(p, form); }
export async function orderAttractions(p: ActionResult, form: FormData) { return orderAction("attraction", "id")(p, form); }
export async function orderTours(p: ActionResult, form: FormData) { return orderAction("tour", "id")(p, form); }
export async function orderPolicies(p: ActionResult, form: FormData) { return orderAction("policy", "slug")(p, form); }

// ───────────────────────────── Policies (draft → publish) ─────────────────────────────

export async function savePolicyDraft(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const slugIn = String(form.get("slug") ?? "");
    const title = localized(form, "title", true);
    const body = localized(form, "body", true);
    if (!slugIn) {
      const slug = slugify(title.en || title.ka);
      if (await db.policy.findUnique({ where: { slug } })) throw new z.ZodError([{ code: "custom", path: ["title.ka"], message: "slug_taken", input: slug }]);
      // a new policy starts unpublished: empty live text, the content waits in the draft
      await db.policy.create({ data: { slug, title, body: { ka: "", en: "", ru: "" }, draft: json({ title, body }), sortOrder: await db.policy.count() } });
      await logActivity({ userId: user.id, action: "policy.create", entity: "Policy", entityId: slug, summary: `Policy "${title.en || title.ka}" created (draft)` });
      adminRefresh();
      return { ok: true, message: "draft_saved" };
    }
    await db.policy.update({ where: { slug: slugIn }, data: { draft: json({ title, body }) } });
    await logActivity({ userId: user.id, action: "policy.draft", entity: "Policy", entityId: slugIn, summary: `Draft saved for policy "${slugIn}"` });
    adminRefresh();
    return { ok: true, message: "draft_saved" };
  });
}

export async function publishPolicy(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const slug = String(form.get("slug"));
    const p = await db.policy.findUniqueOrThrow({ where: { slug } });
    if (!p.draft) throw new ActionError("nothing_to_publish");
    const d = p.draft as { title: Prisma.InputJsonValue; body: Prisma.InputJsonValue };
    await db.policy.update({ where: { slug }, data: { title: d.title, body: d.body, draft: Prisma.DbNull } });
    const ch = diff({ title: p.title, body: p.body }, { title: d.title, body: d.body });
    await logActivity({ userId: user.id, action: "policy.publish", entity: "Policy", entityId: slug, summary: `Policy "${slug}" published`, before: ch.before, after: ch.after });
    done();
    return { ok: true, message: "published" };
  });
}

export async function discardPolicyDraft(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const slug = String(form.get("slug"));
    await db.policy.update({ where: { slug }, data: { draft: Prisma.DbNull } });
    await logActivity({ userId: user.id, action: "policy.discard", entity: "Policy", entityId: slug, summary: `Draft of policy "${slug}" discarded` });
    adminRefresh();
    return { ok: true, message: "draft_discarded" };
  });
}

export async function deletePolicy(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const p = await db.policy.delete({ where: { slug: String(form.get("slug")) } });
    await logActivity({ userId: user.id, action: "policy.delete", entity: "Policy", entityId: p.slug, summary: `Policy "${p.slug}" deleted`, before: rec(p) });
    done();
  });
}

// ───────────────────────────── Offers & packages ─────────────────────────────

export async function saveOffer(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const id = String(form.get("id") ?? "");
    const f = z.object({ validFrom: optDate, validTo: optDate, promoCode: z.string().trim().max(30).optional(), mediaId: z.string().optional() }).parse(Object.fromEntries(form));
    if (f.validFrom && f.validTo && f.validTo < f.validFrom) throw new ActionError("end_before_start");
    const title = localized(form, "title", true);
    const data = {
      title, summary: localized(form, "summary", true), body: localized(form, "body"), badge: localized(form, "badge"),
      promoCode: f.promoCode ? f.promoCode.toUpperCase() : null, validFrom: f.validFrom, validTo: f.validTo, mediaId: f.mediaId || null, active: form.get("active") === "on",
    };
    if (data.promoCode && !(await db.promoCode.findUnique({ where: { code: data.promoCode } }))) throw new ActionError("promo_unknown", { code: data.promoCode });
    if (id) {
      const before = await db.offer.findUniqueOrThrow({ where: { id } });
      await db.offer.update({ where: { id }, data });
      const d = diff(rec(before), { ...before, ...data });
      await logActivity({ userId: user.id, action: "offer.update", entity: "Offer", entityId: id, summary: `Offer "${title.en || title.ka}" updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
    } else {
      let slug = slugify(title.en || title.ka);
      if (await db.offer.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
      const o = await db.offer.create({ data: { ...data, slug, sortOrder: await db.offer.count() } });
      await logActivity({ userId: user.id, action: "offer.create", entity: "Offer", entityId: o.id, summary: `Offer "${title.en || title.ka}" created`, after: data });
    }
    done();
  });
}

export async function deleteOffer(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const o = await db.offer.delete({ where: { id: String(form.get("id")) } });
    await logActivity({ userId: user.id, action: "offer.delete", entity: "Offer", entityId: o.id, summary: `Offer "${rec(o.title).en}" deleted`, before: rec(o) });
    done();
  });
}

// ───────────────────────────── Kobuleti & things to do ─────────────────────────────

export async function saveAttraction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const id = String(form.get("id") ?? "");
    const num = (v: FormDataEntryValue | null, int: boolean) => {
      const s = String(v ?? "").trim().replace(",", ".");
      if (!s) return null;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0 || n > 10000 || (int && !Number.isInteger(n))) throw new ActionError("invalid_number");
      return n;
    };
    const mapUrl = String(form.get("mapUrl") ?? "").trim();
    if (mapUrl && !z.url().safeParse(mapUrl).success) throw new z.ZodError([{ code: "custom", path: ["mapUrl"], message: "invalid_format", input: mapUrl }]);
    const title = localized(form, "title", true);
    const km = num(form.get("distanceKm"), false);
    const data = {
      title, summary: localized(form, "summary", true), body: localized(form, "body"),
      distanceKm: km == null ? null : new Prisma.Decimal(km), driveMinutes: num(form.get("driveMinutes"), true),
      mapUrl: mapUrl || null, mediaId: String(form.get("mediaId") ?? "") || null, active: form.get("active") === "on",
    };
    if (id) {
      const before = await db.attraction.findUniqueOrThrow({ where: { id } });
      await db.attraction.update({ where: { id }, data });
      const d = diff(rec(JSON.parse(JSON.stringify(before))), JSON.parse(JSON.stringify({ ...before, ...data })));
      await logActivity({ userId: user.id, action: "attraction.update", entity: "Attraction", entityId: id, summary: `Kobuleti place "${title.en || title.ka}" updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
    } else {
      let slug = slugify(title.en || title.ka);
      if (await db.attraction.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
      const a = await db.attraction.create({ data: { ...data, slug, sortOrder: await db.attraction.count() } });
      await logActivity({ userId: user.id, action: "attraction.create", entity: "Attraction", entityId: a.id, summary: `Kobuleti place "${title.en || title.ka}" added` });
    }
    done();
  });
}

export async function deleteAttraction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const a = await db.attraction.delete({ where: { id: String(form.get("id")) } });
    await logActivity({ userId: user.id, action: "attraction.delete", entity: "Attraction", entityId: a.id, summary: `Kobuleti place "${rec(a.title).en}" deleted` });
    done();
  });
}

// ───────────────────────────── Tours (information only, no prices) ─────────────────────────────

export async function saveTour(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const id = String(form.get("id") ?? "");
    const title = localized(form, "title", true);
    const mediaId = String(form.get("mediaId") ?? "") || null;
    const data = {
      title, summary: localized(form, "summary", true), body: localized(form, "body"), duration: localized(form, "duration"),
      mediaId, photoIds: [...new Set(form.getAll("photoIds").map(String).filter((x) => x && x !== mediaId))].slice(0, 12),
      active: form.get("active") === "on",
    };
    if (id) {
      const before = await db.tour.findUniqueOrThrow({ where: { id } });
      await db.tour.update({ where: { id }, data });
      const d = diff(rec(JSON.parse(JSON.stringify(before))), JSON.parse(JSON.stringify({ ...before, ...data })));
      await logActivity({ userId: user.id, action: "tour.update", entity: "Tour", entityId: id, summary: `Tour "${title.en || title.ka}" updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
    } else {
      let slug = slugify(title.en || title.ka);
      if (await db.tour.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
      const x = await db.tour.create({ data: { ...data, slug, sortOrder: await db.tour.count() } });
      await logActivity({ userId: user.id, action: "tour.create", entity: "Tour", entityId: x.id, summary: `Tour "${title.en || title.ka}" added` });
    }
    done();
  });
}

export async function deleteTour(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const x = await db.tour.delete({ where: { id: String(form.get("id")) } });
    await logActivity({ userId: user.id, action: "tour.delete", entity: "Tour", entityId: x.id, summary: `Tour "${rec(x.title).en || rec(x.title).ka}" deleted` });
    done();
  });
}
