import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { isIsoDate, todayInGeorgia } from "@/lib/booking/dates";
import { tr } from "@/lib/i18n-content";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ManualBookingForm } from "@/components/admin/ManualBookingForm";

export const metadata: Metadata = { title: "New booking" };

async function NewBooking({ searchParams }: { searchParams: PageProps<"/admin/bookings/new">["searchParams"] }) {
  await connection();
  const user = await requirePermission("bookings");
  const t = await adminT(user.adminLocale);
  const sp = await searchParams;
  const [types, extras] = await Promise.all([
    db.roomType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.extra.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const checkIn = typeof sp.checkIn === "string" && isIsoDate(sp.checkIn) ? sp.checkIn : todayInGeorgia();
  const checkOut = typeof sp.checkOut === "string" && isIsoDate(sp.checkOut) && sp.checkOut > checkIn ? sp.checkOut : undefined;
  const roomTypeId = typeof sp.roomTypeId === "string" && types.some((x) => x.id === sp.roomTypeId) ? sp.roomTypeId : undefined;
  return (
    <AdminFrame user={user} title={t("nb.title")}>
      <ManualBookingForm
        defaultCheckIn={checkIn}
        defaultCheckOut={checkOut}
        defaultRoomTypeId={roomTypeId}
        roomTypes={types.map((x) => ({ id: x.id, name: tr(x.name, user.adminLocale), maxAdults: x.maxAdults, maxOccupancy: x.maxOccupancy }))}
        extras={extras.map((e) => ({ id: e.id, name: tr(e.name, user.adminLocale), price: e.price, unit: e.unit }))}
      />
    </AdminFrame>
  );
}

export default function NewBookingPage({ searchParams }: PageProps<"/admin/bookings/new">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><NewBooking searchParams={searchParams} /></Suspense>;
}
