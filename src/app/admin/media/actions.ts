"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ActionError, localized, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { processImage } from "@/lib/media/process";
import { getStorage } from "@/lib/media/storage";
import { mediaUsage } from "@/lib/admin/media-usage";
import { settingsSchema } from "@/lib/settings-schema";
import { refreshSite } from "@/lib/revalidate";
import { MEDIA_CATEGORIES } from "@/lib/media/categories";
import type { Prisma } from "@/generated/prisma/client";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif", "image/tiff"]);
const MAX_BYTES = 24 * 1024 * 1024;
const done = () => refreshSite("media", "rooms", "content");

function readFile(form: FormData, name = "file") {
  const f = form.get(name);
  if (!(f instanceof File) || f.size === 0) throw new ActionError("file_required");
  if (!TYPES.has(f.type) && !/\.(jpe?g|png|webp|avif|heic|heif|tiff?)$/i.test(f.name)) throw new ActionError("file_type");
  if (f.size > MAX_BYTES) throw new ActionError("file_size", { mb: 24 });
  return f;
}

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, "");

async function removeFiles(urls: (string | null | undefined)[]) {
  const storage = getStorage();
  for (const u of urls) if (u) await storage.removeUrl(u);
}

/** One file per call (the client loops), so a big batch never hits the request size limit. */
export async function uploadMedia(_p: ActionResult, form: FormData): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  return staffAction("media", async (user) => {
    const file = readFile(form);
    const category = z.enum(MEDIA_CATEGORIES).catch("unsorted").parse(form.get("category"));
    const roomTypeId = String(form.get("roomTypeId") ?? "");
    const inGallery = form.get("inGallery") === "on" || form.get("inGallery") === "true";
    let img;
    try { img = await processImage(Buffer.from(await file.arrayBuffer()), baseName(file)); }
    catch { throw new ActionError("file_unreadable"); }
    const existing = await db.media.findUnique({ where: { checksum: img.checksum } });
    const media = existing ?? await db.media.create({
      data: { ...img, category, inGallery, galleryOrder: inGallery ? await db.media.count({ where: { inGallery: true } }) : 0, sourceFile: file.name, alt: { ka: "", en: "", ru: "" } },
    });
    if (roomTypeId) {
      const count = await db.roomTypePhoto.count({ where: { roomTypeId } });
      await db.roomTypePhoto.upsert({ where: { roomTypeId_mediaId: { roomTypeId, mediaId: media.id } }, create: { roomTypeId, mediaId: media.id, sortOrder: count }, update: {} });
    }
    if (!existing) await logActivity({ userId: user.id, action: "media.upload", entity: "Media", entityId: media.id, summary: `Photo uploaded: ${file.name}`, after: { category, roomTypeId: roomTypeId || null, inGallery } });
    done();
    return { ok: true, data: { id: media.id, duplicate: !!existing } };
  });
}

export async function updateMedia(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const id = String(form.get("id"));
    const before = await db.media.findUniqueOrThrow({ where: { id } });
    const alt = localized(form, "alt");
    const category = z.enum(MEDIA_CATEGORIES).parse(form.get("category"));
    const inGallery = form.get("inGallery") === "on";
    const data = {
      alt, category, inGallery,
      galleryOrder: inGallery && !before.inGallery ? await db.media.count({ where: { inGallery: true } }) : before.galleryOrder,
    };
    await db.media.update({ where: { id }, data });
    await logActivity({ userId: user.id, action: "media.update", entity: "Media", entityId: id, summary: `Photo details updated (${before.sourceFile ?? id})`, before: { alt: before.alt, category: before.category, inGallery: before.inGallery }, after: { alt, category, inGallery } });
    done();
  });
}

/** Swap the image file but keep the same Media row → every place that uses it shows the new photo. */
export async function replaceMedia(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const id = String(form.get("id"));
    const file = readFile(form);
    const before = await db.media.findUniqueOrThrow({ where: { id } });
    let img;
    try { img = await processImage(Buffer.from(await file.arrayBuffer()), baseName(file)); }
    catch { throw new ActionError("file_unreadable"); }
    const clash = await db.media.findUnique({ where: { checksum: img.checksum } });
    if (clash && clash.id !== id) throw new ActionError("duplicate_photo");
    await db.media.update({
      where: { id },
      data: { ...img, sourceFile: file.name, isDemo: false, credit: null, creditUrl: null, license: null },
    });
    if (before.url !== img.url) await removeFiles([before.url, before.avifUrl]);
    await logActivity({ userId: user.id, action: "media.replace", entity: "Media", entityId: id, summary: `Photo replaced: ${before.sourceFile ?? before.url} → ${file.name}`, before: { url: before.url, isDemo: before.isDemo }, after: { url: img.url, isDemo: false } });
    done();
  });
}

/** Without `force`, refuses when the photo is in use and returns where. With `force`, removes it from every place first. */
export async function deleteMedia(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const id = String(form.get("id"));
    const force = form.get("force") === "1";
    const usage = (await mediaUsage(user.adminLocale, [id])).get(id) ?? [];
    const real = usage.filter((u) => u.kind !== "gallery");
    if (real.length && !force) throw new ActionError("in_use", { places: real.map((u) => u.label).join(", ") });
    const m = await db.media.findUniqueOrThrow({ where: { id } });
    await db.$transaction(async (tx) => {
      const row = await tx.setting.findUnique({ where: { key: "media" } });
      if (row) {
        const s = settingsSchema.shape.media.parse(row.value);
        const next = { ...s, heroImageIds: s.heroImageIds.filter((x) => x !== id), heroMobileImageId: s.heroMobileImageId === id ? "" : s.heroMobileImageId, ogImageId: s.ogImageId === id ? "" : s.ogImageId };
        await tx.setting.update({ where: { key: "media" }, data: { value: next as Prisma.InputJsonValue } });
      }
      await tx.service.updateMany({ where: { mediaId: id }, data: { mediaId: null } });
      await tx.offer.updateMany({ where: { mediaId: id }, data: { mediaId: null } });
      await tx.attraction.updateMany({ where: { mediaId: id }, data: { mediaId: null } });
      await tx.tour.updateMany({ where: { mediaId: id }, data: { mediaId: null } });
      for (const x of await tx.tour.findMany({ where: { photoIds: { has: id } }, select: { id: true, photoIds: true } }))
        await tx.tour.update({ where: { id: x.id }, data: { photoIds: x.photoIds.filter((p) => p !== id) } });
      await tx.page.updateMany({ where: { ogImageId: id }, data: { ogImageId: null } });
      await tx.media.delete({ where: { id } }); // room-type links cascade
    });
    await removeFiles([m.url, m.avifUrl]);
    await logActivity({ userId: user.id, action: "media.delete", entity: "Media", entityId: id, summary: `Photo deleted: ${m.sourceFile ?? m.url}${real.length ? ` (was used: ${real.map((u) => u.label).join(", ")})` : ""}`, before: { url: m.url, usage: real.map((u) => u.label) } });
    done();
  });
}

// ───────────────────────────── Room-type photos ─────────────────────────────

export async function attachRoomPhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const roomTypeId = String(form.get("roomTypeId"));
    const mediaId = String(form.get("mediaId") ?? "");
    if (!mediaId) throw new ActionError("required");
    const count = await db.roomTypePhoto.count({ where: { roomTypeId } });
    await db.roomTypePhoto.upsert({ where: { roomTypeId_mediaId: { roomTypeId, mediaId } }, create: { roomTypeId, mediaId, sortOrder: count }, update: {} });
    await logActivity({ userId: user.id, action: "roomType.photo.add", entity: "RoomType", entityId: roomTypeId, summary: "Photo added to room type", after: { mediaId } });
    done();
  });
}

export async function detachRoomPhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const roomTypeId = String(form.get("roomTypeId"));
    const mediaId = String(form.get("mediaId"));
    await db.roomTypePhoto.delete({ where: { roomTypeId_mediaId: { roomTypeId, mediaId } } });
    await logActivity({ userId: user.id, action: "roomType.photo.remove", entity: "RoomType", entityId: roomTypeId, summary: "Photo removed from room type", before: { mediaId } });
    done();
  });
}

export async function orderRoomPhotos(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const roomTypeId = String(form.get("roomTypeId"));
    const ids = String(form.get("order") ?? "").split(",").filter(Boolean);
    await db.$transaction(ids.map((mediaId, i) => db.roomTypePhoto.update({ where: { roomTypeId_mediaId: { roomTypeId, mediaId } }, data: { sortOrder: i } })));
    await logActivity({ userId: user.id, action: "roomType.photo.order", entity: "RoomType", entityId: roomTypeId, summary: "Room photos reordered", after: { order: ids } });
    done();
  });
}

export async function setRoomCover(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const roomTypeId = String(form.get("roomTypeId"));
    const mediaId = String(form.get("mediaId"));
    const photos = await db.roomTypePhoto.findMany({ where: { roomTypeId }, orderBy: { sortOrder: "asc" } });
    const ids = [mediaId, ...photos.map((p) => p.mediaId).filter((x) => x !== mediaId)];
    await db.$transaction(ids.map((m, i) => db.roomTypePhoto.update({ where: { roomTypeId_mediaId: { roomTypeId, mediaId: m } }, data: { sortOrder: i } })));
    await logActivity({ userId: user.id, action: "roomType.photo.cover", entity: "RoomType", entityId: roomTypeId, summary: "Room cover photo changed", before: { cover: photos[0]?.mediaId }, after: { cover: mediaId } });
    done();
  });
}

// ───────────────────────────── Gallery & home slots ─────────────────────────────

/** Saves the order of one gallery category; categories keep their own order block. */
export async function orderGallery(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const ids = String(form.get("order") ?? "").split(",").filter(Boolean);
    const all = await db.media.findMany({ where: { inGallery: true }, orderBy: [{ galleryOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const set = new Set(ids);
    // keep other photos where they are; the edited category's photos take its slots in the new order
    const slots = all.map((m) => m.id);
    let k = 0;
    const merged = slots.map((id) => (set.has(id) ? ids[k++] : id));
    await db.$transaction(merged.map((id, i) => db.media.update({ where: { id }, data: { galleryOrder: i } })));
    await logActivity({ userId: user.id, action: "gallery.order", entity: "Media", summary: "Gallery reordered", after: { order: ids } });
    done();
  });
}

export async function setHomeImage(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("media", async (user) => {
    const slot = z.enum(["hero", "heroMobile", "cta", "og"]).parse(form.get("slot"));
    const mediaId = String(form.get("mediaId") ?? "");
    const row = await db.setting.findUnique({ where: { key: "media" } });
    const s = settingsSchema.shape.media.parse(row?.value ?? {});
    const next = { ...s, heroImageIds: [...s.heroImageIds] };
    if (slot === "hero") next.heroImageIds[0] = mediaId;
    if (slot === "cta") next.heroImageIds[1] = mediaId || next.heroImageIds[0];
    if (slot === "heroMobile") next.heroMobileImageId = mediaId;
    if (slot === "og") next.ogImageId = mediaId;
    next.heroImageIds = next.heroImageIds.filter(Boolean);
    await db.setting.upsert({ where: { key: "media" }, create: { key: "media", value: next as Prisma.InputJsonValue }, update: { value: next as Prisma.InputJsonValue } });
    await logActivity({ userId: user.id, action: "settings.media", entity: "Setting", entityId: "media", summary: `Home image "${slot}" changed`, before: s, after: next });
    refreshSite("media", "settings", "content");
  });
}
