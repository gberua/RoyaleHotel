import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { tr } from "@/lib/i18n-content";
import { futureBookingsForRooms } from "@/lib/admin/rooms";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, LocalizedInput, SelectInput, TextInput, Toggle } from "@/components/admin/ui";
import { ICONS } from "@/components/ui/Icon";
import { addAmenity, deleteRoomType, saveRoomType, setRoomTypeActive } from "../../actions";

export const metadata: Metadata = { title: "Room type" };
const L = (j: unknown) => (j ?? {}) as Record<string, string>;
const gel = (n: number | null | undefined) => (n == null ? "" : (n / 100).toFixed(2).replace(/\.00$/, ""));

async function Editor({ params }: { params: PageProps<"/admin/rooms/types/[id]">["params"] }) {
  await connection();
  const user = await requirePermission("rooms");
  const t = await adminT(user.adminLocale);
  const { id } = await params;
  const isNew = id === "new";
  const [rt, amenities] = await Promise.all([
    isNew ? null : db.roomType.findUnique({ where: { id }, include: { amenities: true, rooms: { select: { id: true, number: true } }, photos: { include: { media: true }, orderBy: { sortOrder: "asc" } } } }),
    db.amenity.findMany({ where: { scope: "room" }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!isNew && !rt) notFound();
  const future = rt ? await futureBookingsForRooms(rt.rooms.map((r) => r.id)) : [];
  const has = new Set(rt?.amenities.map((a) => a.amenityId));
  const views = ["", "sea", "partial_sea", "garden", "city", "pool"].map((v) => ({ value: v, label: t(`rooms.views.${v}`) }));
  const section = "mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-ink-500";

  return (
    <AdminFrame user={user} title={isNew ? t("rooms.newType") : `${t("rooms.editType")}: ${tr(rt!.name, user.adminLocale)}`} actions={<Link href="/admin/rooms" className="btn btn-ghost !min-h-10 text-sm">← {t("common.back")}</Link>}>
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <AdminForm action={saveRoomType} submit={isNew ? t("common.create") : t("common.save")} className="space-y-5">
          <input type="hidden" name="id" value={rt?.id ?? ""} />
          <Card>
            <h2 className={section}>{t("rooms.sections.basics")}</h2>
            <div className="grid gap-4">
              <LocalizedInput label={t("rooms.f.name")} name="name" value={L(rt?.name)} required />
              <LocalizedInput label={t("rooms.f.shortDescription")} name="shortDescription" value={L(rt?.shortDescription)} multiline rows={2} />
              <LocalizedInput label={t("rooms.f.description")} name="description" value={L(rt?.description)} multiline rows={6} />
              <LocalizedInput label={t("rooms.f.beds")} name="beds" value={L(rt?.beds)} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <TextInput label={t("rooms.f.sizeM2")} name="sizeM2" defaultValue={rt?.sizeM2} inputMode="numeric" />
                <SelectInput label={t("rooms.f.view")} name="view" defaultValue={rt?.view ?? ""} options={views} />
                <TextInput label={t("rooms.f.sortOrder")} name="sortOrder" defaultValue={rt?.sortOrder ?? 0} inputMode="numeric" />
                <TextInput label={t("rooms.f.slug")} name="slug" defaultValue={rt?.slug} hint={t("rooms.f.slugHint")} />
              </div>
              <div className="flex flex-wrap gap-x-8">
                <Toggle name="active" label={t("rooms.f.active")} defaultChecked={rt?.active ?? true} />
                <Toggle name="featured" label={t("rooms.f.featured")} defaultChecked={rt?.featured ?? false} />
              </div>
            </div>
          </Card>
          <Card>
            <h2 className={section}>{t("rooms.sections.capacity")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TextInput label={t("rooms.f.maxAdults")} name="maxAdults" defaultValue={rt?.maxAdults ?? 2} inputMode="numeric" required />
              <TextInput label={t("rooms.f.maxChildren")} name="maxChildren" defaultValue={rt?.maxChildren ?? 1} inputMode="numeric" required />
              <TextInput label={t("rooms.f.maxOccupancy")} name="maxOccupancy" defaultValue={rt?.maxOccupancy ?? 3} inputMode="numeric" required />
              <TextInput label={t("rooms.f.baseOccupancy")} name="baseOccupancy" defaultValue={rt?.baseOccupancy ?? 2} inputMode="numeric" required />
            </div>
            <p className="mt-2 text-xs text-ink-500">{t("rooms.f.baseOccupancyHint")}</p>
          </Card>
          <Card>
            <h2 className={section}>{t("rooms.sections.pricing")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <TextInput label={t("rooms.f.basePrice")} name="basePrice" defaultValue={gel(rt?.basePrice)} inputMode="decimal" required />
              <TextInput label={t("rooms.f.weekendPrice")} name="weekendPrice" defaultValue={gel(rt?.weekendPrice)} inputMode="decimal" />
              <TextInput label={t("rooms.f.minStay")} name="minStay" defaultValue={rt?.minStay ?? 1} inputMode="numeric" required />
            </div>
            <p className="mt-2 text-xs text-ink-500">{t("rooms.f.basePriceHint")}</p>
          </Card>
          <Card>
            <h2 className={section}>{t("rooms.sections.amenities")}</h2>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {amenities.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-mist">
                  <input type="checkbox" name="amenity" value={a.id} defaultChecked={has.has(a.id)} className="h-4 w-4 accent-sea-700" /> {tr(a.name, user.adminLocale)}
                </label>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className={section}>{t("rooms.sections.seo")}</h2>
            <div className="grid gap-4">
              <LocalizedInput label={t("rooms.f.seoTitle")} name="seoTitle" value={L(rt?.seoTitle)} />
              <LocalizedInput label={t("rooms.f.seoDescription")} name="seoDescription" value={L(rt?.seoDescription)} multiline rows={2} />
            </div>
          </Card>
        </AdminForm>

        <div className="space-y-5">
          {rt && (
            <Card title={t("rooms.photos", { count: rt.photos.length })}>
              <div className="grid grid-cols-3 gap-2">
                {rt.photos.slice(0, 6).map((p) => <span key={p.mediaId} className="relative aspect-square overflow-hidden rounded-lg bg-mist"><Image src={p.media.url} alt="" fill sizes="100px" className="object-cover" /></span>)}
              </div>
              <Link href={`/admin/media?tab=rooms&type=${rt.id}`} className="btn btn-ghost mt-3 w-full !min-h-10 text-sm">{t("rooms.managePhotos")}</Link>
            </Card>
          )}
          <Card title={t("rooms.f.addAmenity")}>
            <AdminForm action={addAmenity} submit={t("common.add")} tone="ghost" resetOnSuccess className="space-y-3">
              <LocalizedInput label={t("rooms.f.amenityName")} name="amenityName" required />
              <SelectInput label={t("rooms.f.icon")} name="icon" defaultValue="Sparkles" options={Object.keys(ICONS).map((k) => ({ value: k, label: k }))} />
            </AdminForm>
          </Card>
          {rt && (
            <Card>
              {future.length > 0 && (
                <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-semibold">{t("errors.has_future_bookings", { count: future.length })}</p>
                  <p className="mt-1">{future.slice(0, 12).map((f) => `${f.code} (${f.room}, ${f.checkIn})`).join(" · ")}{future.length > 12 ? " …" : ""}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {rt.active
                  ? <ActionButton action={setRoomTypeActive} fields={{ id: rt.id, active: "false" }} label={t("common.archive")} confirm={t("rooms.archiveConfirm")} />
                  : <ActionButton action={setRoomTypeActive} fields={{ id: rt.id, active: "true" }} label={t("common.restore")} />}
                <ActionButton action={deleteRoomType} fields={{ id: rt.id }} label={t("common.delete")} tone="danger" confirm={t("rooms.deleteConfirm")} />
              </div>
              <p className="mt-2 text-xs text-ink-500">{t("rooms.archiveHint")}</p>
            </Card>
          )}
        </div>
      </div>
    </AdminFrame>
  );
}

export default function RoomTypePage({ params }: PageProps<"/admin/rooms/types/[id]">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Editor params={params} /></Suspense>;
}
