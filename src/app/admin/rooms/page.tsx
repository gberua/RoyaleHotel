import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { todayInGeorgia, toDate } from "@/lib/booking/dates";
import { tr } from "@/lib/i18n-content";
import { formatMoney } from "@/lib/money";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, SelectInput, TextInput } from "@/components/admin/ui";
import { SortableList } from "@/components/admin/Sortable";
import { addRoomBlock, deleteRoom, moveRoomType, removeRoomBlock, saveRoom, setRoomActive } from "./actions";

export const metadata: Metadata = { title: "Rooms" };

async function Rooms() {
  await connection();
  const user = await requirePermission("rooms");
  const t = await adminT(user.adminLocale);
  const L = user.adminLocale;
  const [types, rooms, blocks] = await Promise.all([
    db.roomType.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }], include: { photos: { include: { media: true }, orderBy: { sortOrder: "asc" }, take: 1 }, _count: { select: { rooms: true, photos: true } } } }),
    db.room.findMany({ orderBy: [{ active: "desc" }, { number: "asc" }], include: { roomType: { select: { name: true } } } }),
    db.roomAllocation.findMany({ where: { kind: "MAINTENANCE", active: true, checkOut: { gt: toDate(todayInGeorgia()) } }, orderBy: { checkIn: "asc" } }),
  ]);
  const typeOptions = types.map((x) => ({ value: x.id, label: `${tr(x.name, L)}${x.active ? "" : ` (${t("rooms.archivedTag")})`}` }));
  const money = (n: number) => formatMoney(n, undefined, "en");

  return (
    <AdminFrame user={user} title={t("rooms.title")} actions={<Link href="/admin/rooms/types/new" className="btn btn-primary !min-h-10 text-sm"><Plus size={15} aria-hidden /> {t("rooms.newType")}</Link>}>
      <div className="space-y-6">
        <Card title={t("rooms.types")}>
          <SortableList action={moveRoomType} items={types.map((x) => ({
            id: x.id,
            node: (
              <Link href={`/admin/rooms/types/${x.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-mist">
                <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-mist">{x.photos[0] && <Image src={x.photos[0].media.url} alt="" fill sizes="80px" className="object-cover" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{tr(x.name, L)} {!x.active && <span className="ml-1 rounded bg-ink-100 px-1.5 text-xs font-normal">{t("rooms.archivedTag")}</span>}</span>
                  <span className="block text-xs text-ink-500">{t("rooms.roomsCount", { count: x._count.rooms })} · {t("rooms.photos", { count: x._count.photos })} · {t("rooms.from", { price: money(x.basePrice) })}</span>
                </span>
                <span className="text-sm font-semibold text-sea-700">{t("common.edit")}</span>
              </Link>
            ),
          }))} />
        </Card>

        <Card title={t("rooms.units")}>
          <p className="mb-3 text-xs text-ink-500">{t("rooms.archiveHint")}</p>
          <ul className="space-y-3">
            {rooms.map((r) => (
              <li key={r.id} className={`rounded-xl p-3 ring-1 ring-ink-100 ${r.active ? "" : "bg-mist/60"}`}>
                <AdminForm action={saveRoom} submit={t("common.save")} tone="ghost" className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[6rem_5rem_1fr_1.4fr]">
                  <input type="hidden" name="id" value={r.id} />
                  <TextInput label={t("rooms.number")} name="number" defaultValue={r.number} required />
                  <TextInput label={t("rooms.floor")} name="floor" defaultValue={r.floor} inputMode="numeric" />
                  <SelectInput label={t("rooms.type")} name="roomTypeId" defaultValue={r.roomTypeId} options={typeOptions} className="col-span-2 sm:col-span-1" />
                  <TextInput label={t("rooms.notes")} name="notes" defaultValue={r.notes} className="col-span-2 sm:col-span-1" />
                </AdminForm>
                <div className="mt-2 flex flex-wrap items-start gap-2 border-t border-ink-100 pt-2">
                  {r.active
                    ? <ActionButton action={setRoomActive} fields={{ id: r.id, active: "false" }} label={t("common.archive")} confirm={t("rooms.archiveConfirm")} />
                    : <ActionButton action={setRoomActive} fields={{ id: r.id, active: "true" }} label={t("common.restore")} />}
                  <ActionButton action={deleteRoom} fields={{ id: r.id }} label={t("common.delete")} tone="danger" confirm={t("rooms.deleteConfirm")} />
                </div>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-medium text-ink-700">{t("rooms.blocks")} ({blocks.filter((b) => b.roomId === r.id).length})</summary>
                  <ul className="mt-2 space-y-1">
                    {blocks.filter((b) => b.roomId === r.id).map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-mist px-2 py-1 text-xs">
                        <span>{b.checkIn.toISOString().slice(0, 10)} → {b.checkOut.toISOString().slice(0, 10)} · {b.note}</span>
                        <ActionButton action={removeRoomBlock} fields={{ id: b.id }} label={t("rooms.unblock")} />
                      </li>
                    ))}
                  </ul>
                  <AdminForm action={addRoomBlock} submit={t("rooms.block")} tone="ghost" resetOnSuccess className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-[10rem_10rem_1fr]">
                    <input type="hidden" name="roomId" value={r.id} />
                    <TextInput label={t("common.from")} name="from" type="date" required />
                    <TextInput label={t("common.to")} name="to" type="date" required />
                    <TextInput label={t("rooms.blockReason")} name="reason" required className="col-span-2 sm:col-span-1" />
                  </AdminForm>
                </details>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-mist p-3">
            <p className="mb-2 text-sm font-semibold">{t("rooms.addRoom")}</p>
            <AdminForm action={saveRoom} submit={t("common.add")} resetOnSuccess className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[6rem_5rem_1fr_1.4fr]">
              <TextInput label={t("rooms.number")} name="number" required />
              <TextInput label={t("rooms.floor")} name="floor" inputMode="numeric" />
              <SelectInput label={t("rooms.type")} name="roomTypeId" options={typeOptions} className="col-span-2 sm:col-span-1" />
              <TextInput label={t("rooms.notes")} name="notes" className="col-span-2 sm:col-span-1" />
            </AdminForm>
          </div>
        </Card>
      </div>
    </AdminFrame>
  );
}

export default function RoomsPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Rooms /></Suspense>;
}
