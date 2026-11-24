"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ActionError, diff, gelToTetri, roomPrice, localized, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { isIsoDate, toDate, toIso } from "@/lib/booking/dates";
import { seasonOverlaps } from "@/lib/booking/rates";
import { refreshSite } from "@/lib/revalidate";
import { slugify } from "@/lib/media/process";

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const optInt = (min: number, max: number) => z.union([z.literal(""), int(min, max)]).optional().transform((v) => (v === "" || v == null ? null : Number(v)));
const isoDate = z.string().refine(isIsoDate, "invalid_date");
const optDate = z.union([z.literal(""), isoDate]).optional().transform((v) => (v ? toDate(v) : null));
const done = () => refreshSite("rooms");
const rec = (x: object) => x as unknown as Record<string, unknown>;

// ───────────────────────────── Seasons ─────────────────────────────

export async function saveSeason(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id") ?? "");
    const name = localized(form, "name", true);
    const f = z.object({ startDate: isoDate, endDate: isoDate, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal("")) }).parse(Object.fromEntries(form));
    if (f.endDate < f.startDate) throw new ActionError("end_before_start");
    const types = await db.roomType.findMany({ select: { id: true } });
    const rates: { roomTypeId: string; price: number; weekendPrice: number | null; minStay: number | null }[] = [];
    for (const rt of types) {
      const price = roomPrice(gelToTetri(form.get(`price.${rt.id}`)));
      if (price == null) continue;
      const ms = String(form.get(`minStay.${rt.id}`) ?? "").trim();
      const minStay = ms ? Number(ms) : null;
      if (minStay != null && (!Number.isInteger(minStay) || minStay < 1 || minStay > 60)) throw new ActionError("min_stay_invalid");
      rates.push({ roomTypeId: rt.id, price, weekendPrice: roomPrice(gelToTetri(form.get(`weekendPrice.${rt.id}`))), minStay });
    }
    const data = { name, startDate: toDate(f.startDate), endDate: toDate(f.endDate), color: f.color || null };
    const label = name.en || name.ka;
    let seasonId = id;
    if (id) {
      const before = await db.season.findUniqueOrThrow({ where: { id }, include: { rates: true } });
      await db.$transaction([
        db.season.update({ where: { id }, data }),
        db.seasonRate.deleteMany({ where: { seasonId: id } }),
        db.seasonRate.createMany({ data: rates.map((r) => ({ ...r, seasonId: id })) }),
      ]);
      const d = diff(rec({ ...before, startDate: toIso(before.startDate), endDate: toIso(before.endDate), rates: before.rates.map(({ roomTypeId, price, weekendPrice, minStay }) => ({ roomTypeId, price, weekendPrice, minStay })) }), rec({ ...data, startDate: f.startDate, endDate: f.endDate, rates }));
      await logActivity({ userId: user.id, action: "season.update", entity: "Season", entityId: id, summary: `Season "${label}" updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
    } else {
      const s = await db.season.create({ data: { ...data, rates: { create: rates } } });
      seasonId = s.id;
      await logActivity({ userId: user.id, action: "season.create", entity: "Season", entityId: s.id, summary: `Season "${label}" created (${f.startDate} → ${f.endDate})`, after: { ...data, rates } });
    }
    done();
    const all = await db.season.findMany();
    const clash = seasonOverlaps(all.map((s) => ({ id: s.id, name: "", startDate: toIso(s.startDate), endDate: toIso(s.endDate) })));
    return { ok: true, message: clash.some((c) => c.a === seasonId || c.b === seasonId) ? "saved_with_overlap" : undefined };
  });
}

export async function deleteSeason(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id"));
    const s = await db.season.delete({ where: { id }, include: { rates: true } });
    await logActivity({ userId: user.id, action: "season.delete", entity: "Season", entityId: id, summary: `Season "${(s.name as Record<string, string>).en}" deleted`, before: rec(s) });
    done();
  });
}

// ───────────────────────────── Extras ─────────────────────────────

export async function saveExtra(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id") ?? "");
    const name = localized(form, "name", true);
    const f = z.object({ unit: z.enum(["PER_STAY", "PER_NIGHT", "PER_GUEST", "PER_GUEST_NIGHT"]), icon: z.string().trim().max(40).optional(), sortOrder: int(0, 999).optional() }).parse(Object.fromEntries(form));
    const data = { name, description: localized(form, "description"), unit: f.unit, icon: f.icon || null, price: gelToTetri(form.get("price"), true)!, active: form.get("active") === "on" };
    if (id) {
      const before = await db.extra.findUniqueOrThrow({ where: { id } });
      await db.extra.update({ where: { id }, data });
      const d = diff(rec(before), rec({ ...before, ...data }));
      await logActivity({ userId: user.id, action: "extra.update", entity: "Extra", entityId: id, summary: `Extra "${name.en || name.ka}" updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
    } else {
      let key = slugify(name.en || name.ka) || "extra";
      if (await db.extra.findUnique({ where: { key } })) key = `${key}-${Date.now().toString(36)}`;
      const count = await db.extra.count();
      const x = await db.extra.create({ data: { ...data, key, sortOrder: count } });
      await logActivity({ userId: user.id, action: "extra.create", entity: "Extra", entityId: x.id, summary: `Extra "${name.en || name.ka}" created`, after: data });
    }
    done();
  });
}

export async function deleteExtra(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id"));
    const used = await db.bookingExtra.count({ where: { extraId: id } });
    if (used) throw new ActionError("extra_in_use", { count: used });
    const x = await db.extra.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "extra.delete", entity: "Extra", entityId: id, summary: `Extra "${(x.name as Record<string, string>).en}" deleted`, before: rec(x) });
    done();
  });
}

export async function moveExtras(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async () => {
    const ids = String(form.get("order") ?? "").split(",").filter(Boolean);
    await db.$transaction(ids.map((id, i) => db.extra.update({ where: { id }, data: { sortOrder: i } })));
    done();
  });
}

// ───────────────────────────── Children & extra beds ─────────────────────────────

export async function saveOccupancyRule(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id") ?? "");
    const name = localized(form, "name", true);
    const f = z.object({ kind: z.enum(["child", "extra_adult", "extra_bed"]), minAge: optInt(0, 17), maxAge: optInt(0, 17), mode: z.enum(["fixed", "percent"]), percentOfRoom: optInt(0, 200) }).parse(Object.fromEntries(form));
    if (f.kind === "child" && (f.minAge == null || f.maxAge == null)) throw new ActionError("age_band_required");
    if (f.minAge != null && f.maxAge != null && f.maxAge < f.minAge) throw new ActionError("age_band_invalid");
    if (f.mode === "percent" && f.percentOfRoom == null) throw new ActionError("percent_required");
    const data = {
      name, kind: f.kind, minAge: f.kind === "child" ? f.minAge : null, maxAge: f.kind === "child" ? f.maxAge : null,
      percentOfRoom: f.mode === "percent" ? f.percentOfRoom : null,
      pricePerNight: f.mode === "fixed" ? (gelToTetri(form.get("pricePerNight")) ?? 0) : 0,
    };
    if (f.kind === "child") {
      const others = await db.occupancyRule.findMany({ where: { kind: "child", NOT: id ? { id } : undefined } });
      if (others.some((o) => o.minAge! <= data.maxAge! && data.minAge! <= o.maxAge!)) throw new ActionError("age_band_overlap");
    }
    if (id) {
      const before = await db.occupancyRule.findUniqueOrThrow({ where: { id } });
      await db.occupancyRule.update({ where: { id }, data });
      const d = diff(rec(before), rec({ ...before, ...data }));
      await logActivity({ userId: user.id, action: "occupancy.update", entity: "OccupancyRule", entityId: id, summary: `Guest pricing "${name.en || name.ka}" updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
    } else {
      const r = await db.occupancyRule.create({ data: { ...data, sortOrder: await db.occupancyRule.count() } });
      await logActivity({ userId: user.id, action: "occupancy.create", entity: "OccupancyRule", entityId: r.id, summary: `Guest pricing "${name.en || name.ka}" created`, after: data });
    }
    done();
  });
}

export async function deleteOccupancyRule(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id"));
    const r = await db.occupancyRule.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "occupancy.delete", entity: "OccupancyRule", entityId: id, summary: `Guest pricing "${(r.name as Record<string, string>).en}" deleted`, before: rec(r) });
    done();
  });
}

// ───────────────────────────── Promo codes ─────────────────────────────

export async function savePromo(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id") ?? "");
    const f = z.object({
      code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "code_format"),
      description: z.string().trim().max(200).optional(),
      type: z.enum(["PERCENT", "FIXED"]),
      value: z.coerce.number().positive(),
      validFrom: optDate, validTo: optDate, stayFrom: optDate, stayTo: optDate,
      minNights: optInt(1, 60), maxUses: optInt(1, 100000), perGuestLimit: optInt(1, 100),
    }).parse(Object.fromEntries(form));
    if (f.type === "PERCENT" && (f.value > 90 || !Number.isInteger(f.value))) throw new ActionError("percent_invalid");
    for (const [a, b] of [[f.validFrom, f.validTo], [f.stayFrom, f.stayTo]] as const) if (a && b && b < a) throw new ActionError("end_before_start");
    const code = f.code.toUpperCase();
    const clash = await db.promoCode.findFirst({ where: { code: { equals: code, mode: "insensitive" }, NOT: id ? { id } : undefined } });
    if (clash) throw new z.ZodError([{ code: "custom", path: ["code"], message: "code_taken", input: code }]);
    const data = {
      code, description: f.description || null, type: f.type, value: f.type === "PERCENT" ? f.value : Math.round(f.value * 100),
      validFrom: f.validFrom, validTo: f.validTo, stayFrom: f.stayFrom, stayTo: f.stayTo, minNights: f.minNights, maxUses: f.maxUses, perGuestLimit: f.perGuestLimit,
      roomTypeIds: form.getAll("roomTypeId").map(String), active: form.get("active") === "on",
    };
    if (id) {
      const before = await db.promoCode.findUniqueOrThrow({ where: { id } });
      await db.promoCode.update({ where: { id }, data });
      const d = diff(rec(before), rec({ ...before, ...data }));
      await logActivity({ userId: user.id, action: "promo.update", entity: "PromoCode", entityId: id, summary: `Promo ${code} updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
    } else {
      const p = await db.promoCode.create({ data });
      await logActivity({ userId: user.id, action: "promo.create", entity: "PromoCode", entityId: p.id, summary: `Promo ${code} created`, after: data });
    }
  });
}

export async function setPromoActive(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id"));
    const active = form.get("active") === "true";
    const p = await db.promoCode.update({ where: { id }, data: { active } });
    await logActivity({ userId: user.id, action: active ? "promo.activate" : "promo.deactivate", entity: "PromoCode", entityId: id, summary: `Promo ${p.code} ${active ? "activated" : "deactivated"}`, before: { active: !active }, after: { active } });
  });
}

export async function deletePromo(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const id = String(form.get("id"));
    const used = await db.booking.count({ where: { promoCodeId: id } });
    if (used) throw new ActionError("promo_in_use", { count: used });
    const p = await db.promoCode.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "promo.delete", entity: "PromoCode", entityId: id, summary: `Promo ${p.code} deleted`, before: rec(p) });
  });
}
