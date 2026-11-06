import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentStaff } from "@/lib/admin-auth";
import { can, type RoleName } from "@/lib/permissions";

async function Home() {
  await connection();
  const user = await currentStaff();
  if (!user) redirect("/admin/login");
  // the dashboard arrives in phase 2; until then each role starts on its first permitted screen
  redirect(user.role === "HOUSEKEEPING" ? "/admin/housekeeping" : can(user.role as RoleName, "bookings") ? "/admin/bookings" : "/admin/account");
  return null;
}

export default function AdminHome() {
  return <Suspense><Home /></Suspense>;
}
