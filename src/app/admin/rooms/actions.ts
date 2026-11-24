"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ActionError, diff, gelToTetri, roomPrice, localized, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { isIsoDate, toDate } from "@/lib/booking/dates";
import { deletionVerdict } from "@/lib/admin/rooms";
import { refreshSite } from "@/lib/revalidate";
import { slugify } from "@/lib/media/process";

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const done = () => refreshSite("rooms", "media", "content");

// ───────────────────────────── Room types ─────────────────────────────

export async function saveRoomType(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const id = String(form.get("id") ?? "");
    const name = localized(form, "name", true);
    const base = z.object({
      slug: z.string().trim().max(60).optional(),
      sizeM2: z.union([z.literal(""), int(5, 500)]).optional(),
      view: z.enum(["", "sea", "partial_sea", "garden", "city", "pool"]),
      maxAdults: int(1, 10), maxChildren: int(0, 10), maxOccupancy: int(1, 14), baseOccupancy: int(1, 14), minStay: int(1, 30), sortOrder: int(0, 999),
    }).parse(Object.fromEntries(form));
    if (base.baseOccupancy > base.maxOccupancy) throw new z.ZodError([{ code: "custom", path: ["baseOccupancy"], message: "too_big", input: base.baseOccupancy }]);
    if (base.maxAdults > base.maxOccupancy) throw new z.ZodError([{ code: "custom", path: ["maxAdults"], message: "too_big", input: base.maxAdults }]);
    const slug = slugify(base.slug || name.en || name.ka);
    const clash = await db.roomType.findFirst({ where: { slug, NOT: id ? { id } : undefined } });
    if (clash) throw new z.ZodError([{ code: "custom", path: ["slug"], message: "slug_taken", input: slug }]);
    const data = {
      slug, name, shortDescription: localized(form, "shortDescription"), description: localized(form, "description"), beds: localized(form, "beds"),
      seoTitle: localized(form, "seoTitle"), seoDescription: localized(form, "seoDescription"),
      sizeM2: base.sizeM2 === "" || base.sizeM2 == null ? null : Number(base.sizeM2), view: base.view || null,
      maxAdults: base.maxAdults, maxChildren: base.maxChildren, maxOccupancy: base.maxOccupancy, baseOccupancy: base.baseOccupancy,
      extraBeds: Math.max(0, base.maxOccupancy - base.baseOccupancy),
      basePrice: roomPrice(gelToTetri(form.get("basePrice"), true)!), weekendPrice: roomPrice(gelToTetri(form.get("weekendPrice"))),
      minStay: base.minStay, sortOrder: base.sortOrder, featured: form.get("featured") === "on", active: form.get("active") === "on",
    };
    const amenityIds = form.getAll("amenity").map(String);
    if (id) {
      const before = await db.roomType.findUniqueOrThrow({ where: { id } });
      await db.$transaction([
        db.roomType.update({ where: { id }, data }),
        db.roomTypeAmenity.deleteMany({ where: { roomTypeId: id } }),
        db.roomTypeAmenity.createMany({ data: amenityIds.map((amenityId) => ({ roomTypeId: id, amenityId })) }),
      ]);
      const d = diff(before as unknown as Record<string, unknown>, { ...before, ...data } as unknown as Record<string, unknown>);
      await logActivity({ userId: user.id, action: "roomType.update", entity: "RoomType", entityId: id, summary: `Room type "${name.en || name.ka}" updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
      done();
      return { ok: true };
    }
    const rt = await db.roomType.create({ data: { ...data, amenities: { create: amenityIds.map((amenityId) => ({ amenityId })) } } });
    await logActivity({ userId: user.id, action: "roomType.create", entity: "RoomType", entityId: rt.id, summary: `Room type "${name.en || name.ka}" created`, after: data });
    done();
    redirect(`/admin/rooms/types/${rt.id}?created=1`);
  });
}

export async function addAmenity(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const name = localized(form, "amenityName", true);
    const icon = z.string().max(40).parse(form.get("icon") || "Sparkles");
    const key = `custom-${slugify(name.en || name.ka)}-${Date.now().toString(36)}`;
    const max = await db.amenity.aggregate({ _max: { sortOrder: true } });
    await db.amenity.create({ data: { key, icon, name, scope: "room", sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    await logActivity({ userId: user.id, action: "amenity.create", entity: "Amenity", summary: `Amenity "${name.en || name.ka}" added` });
    return { ok: true, message: "created" };
  });
}

export async function setRoomTypeActive(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const id = String(form.get("id"));
    const active = form.get("active") === "true";
    const rt = await db.roomType.update({ where: { id }, data: { active } });
    await logActivity({ userId: user.id, action: active ? "roomType.restore" : "roomType.archive", entity: "RoomType", entityId: id, summary: `Room type "${(rt.name as Record<string, string>).en}" ${active ? "restored" : "archived (hidden from the website and new bookings)"}` });
    done();
    return { ok: true, message: active ? "restored" : "archived" };
  });
}

export async function deleteRoomType(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const id = String(form.get("id"));
    const rooms = await db.room.findMany({ where: { roomTypeId: id }, select: { id: true } });
    const v = await deletionVerdict(rooms.map((r) => r.id));
    if (!v.canDelete) throw new ActionError(v.reason, { count: v.bookings.length, codes: v.bookings.map((b) => b.code).join(", ") });
    const rt = await db.roomType.findUniqueOrThrow({ where: { id } });
    await db.$transaction([db.room.deleteMany({ where: { roomTypeId: id } }), db.roomType.delete({ where: { id } })]);
    await logActivity({ userId: user.id, action: "roomType.delete", entity: "RoomType", entityId: id, summary: `Room type "${(rt.name as Record<string, string>).en}" deleted`, before: rt });
    done();
    redirect("/admin/rooms?deleted=1");
  });
}

export async function moveRoomType(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async () => {
    const ids = String(form.get("order")).split(",").filter(Boolean);
    await db.$transaction(ids.map((id, i) => db.roomType.update({ where: { id }, data: { sortOrder: i + 1 } })));
    done();
    return { ok: true, message: "orderSaved" };
  });
}

// ───────────────────────────── Room numbers ─────────────────────────────

export async function saveRoom(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const p = z.object({ id: z.string().optional(), number: z.string().trim().min(1).max(10), floor: z.union([z.literal(""), z.coerce.number().int().min(-2).max(60)]), roomTypeId: z.string().min(1), notes: z.string().max(500).optional() }).parse(Object.fromEntries(form));
    const clash = await db.room.findFirst({ where: { number: p.number, NOT: p.id ? { id: p.id } : undefined } });
    if (clash) throw new z.ZodError([{ code: "custom", path: ["number"], message: "number_taken", input: p.number }]);
    const data = { number: p.number, floor: p.floor === "" ? null : Number(p.floor), roomTypeId: p.roomTypeId, notes: p.notes || null };
    if (p.id) {
      const before = await db.room.findUniqueOrThrow({ where: { id: p.id } });
      await db.room.update({ where: { id: p.id }, data });
      const d = diff(before as unknown as Record<string, unknown>, { ...before, ...data } as unknown as Record<string, unknown>);
      await logActivity({ userId: user.id, action: "room.update", entity: "Room", entityId: p.id, summary: `Room ${p.number} updated (${d.changed.join(", ")})`, before: d.before, after: d.after });
    } else {
      const r = await db.room.create({ data });
      await logActivity({ userId: user.id, action: "room.create", entity: "Room", entityId: r.id, summary: `Room ${p.number} added` });
    }
    done();
    return { ok: true };
  });
}

export async function setRoomActive(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const id = String(form.get("id"));
    const active = form.get("active") === "true";
    const r = await db.room.update({ where: { id }, data: { active } });
    await logActivity({ userId: user.id, action: active ? "room.restore" : "room.archive", entity: "Room", entityId: id, summary: `Room ${r.number} ${active ? "restored" : "archived"}` });
    done();
    return { ok: true, message: active ? "restored" : "archived" };
  });
}

export async function deleteRoom(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const id = String(form.get("id"));
    const v = await deletionVerdict([id]);
    if (!v.canDelete) throw new ActionError(v.reason, { count: v.bookings.length, codes: v.bookings.map((b) => b.code).join(", ") });
    const r = await db.room.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "room.delete", entity: "Room", entityId: id, summary: `Room ${r.number} deleted` });
    done();
    return { ok: true, message: "deleted" };
  });
}

/** Out of order for a date range: a MAINTENANCE allocation — removed from availability, guarded by the overlap constraint. */
export async function addRoomBlock(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const p = z.object({ roomId: z.string().min(1), from: z.string().refine(isIsoDate, "required"), to: z.string().refine(isIsoDate, "required"), reason: z.string().trim().min(1).max(200) }).parse(Object.fromEntries(form));
    if (p.to <= p.from) throw new ActionError("dates_invalid");
    const conflicts = await db.roomAllocation.findMany({
      where: { roomId: p.roomId, active: true, checkIn: { lt: toDate(p.to) }, checkOut: { gt: toDate(p.from) }, OR: [{ kind: { not: "HOLD" } }, { holdExpiresAt: { gt: new Date() } }] },
      include: { booking: { select: { code: true } } },
    });
    if (conflicts.length) throw new ActionError("block_conflict", { codes: conflicts.map((c) => c.booking?.code ?? c.note ?? c.kind).join(", ") });
    const room = await db.room.findUniqueOrThrow({ where: { id: p.roomId } });
    await db.roomAllocation.create({ data: { roomId: p.roomId, roomTypeId: room.roomTypeId, checkIn: toDate(p.from), checkOut: toDate(p.to), kind: "MAINTENANCE", note: p.reason } });
    await logActivity({ userId: user.id, action: "room.block", entity: "Room", entityId: p.roomId, summary: `Room ${room.number} out of order ${p.from} → ${p.to}: ${p.reason}` });
    return { ok: true, message: "created" };
  });
}

export async function removeRoomBlock(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("rooms", async (user) => {
    const id = String(form.get("id"));
    const a = await db.roomAllocation.findUniqueOrThrow({ where: { id }, include: { room: true } });
    if (a.kind !== "MAINTENANCE") throw new ActionError("forbidden");
    await db.roomAllocation.update({ where: { id }, data: { active: false } });
    await logActivity({ userId: user.id, action: "room.unblock", entity: "Room", entityId: a.roomId, summary: `Room ${a.room.number} block ${a.checkIn.toISOString().slice(0, 10)} → ${a.checkOut.toISOString().slice(0, 10)} removed` });
    return { ok: true, message: "deleted" };
  });
}
