import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Lock } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT, ADMIN_LOCALES } from "@/lib/admin-i18n";
import { ROLE_PERMISSIONS, type RoleName } from "@/lib/permissions";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, SelectInput, TextInput, Toggle } from "@/components/admin/ui";
import { stampInGeorgia } from "@/lib/booking/dates";
import { resetStaffPassword, saveStaff, setStaffActive, unlockStaff } from "./actions";

export const metadata: Metadata = { title: "Staff" };
const ROLES: RoleName[] = ["OWNER", "MANAGER", "RECEPTION", "HOUSEKEEPING"];

async function Staff() {
  await connection();
  const user = await requirePermission("staff");
  const t = await adminT(user.adminLocale);
  const staff = await db.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] });
  const roleOptions = ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }));
  const langOptions = ADMIN_LOCALES.map((l) => ({ value: l, label: t(`langs.${l}`) }));
  const fmt = (d: Date | null) => (d ? stampInGeorgia(d) : "—");

  const form = (u?: (typeof staff)[number]) => (
    <AdminForm action={saveStaff} submit={u ? t("common.save") : t("staff.create")} resetOnSuccess={!u} tone={u ? "ghost" : "primary"} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1fr_10rem_8rem]">
      {u && <input type="hidden" name="id" value={u.id} />}
      <TextInput label={t("staff.name")} name="name" defaultValue={u?.name} required />
      <TextInput label={t("staff.email")} name="email" type="email" defaultValue={u?.email} required />
      <TextInput label={t("staff.phone")} name="phone" type="tel" defaultValue={u?.phone} />
      <SelectInput label={t("staff.role")} name="role" defaultValue={u?.role ?? "RECEPTION"} options={roleOptions} />
      <SelectInput label={t("staff.language")} name="adminLocale" defaultValue={u?.adminLocale ?? "ka"} options={langOptions} />
      {!u && <div className="sm:col-span-2 lg:col-span-5"><Toggle name="invite" label={t("staff.invite")} hint={t("staff.inviteHint")} defaultChecked /></div>}
    </AdminForm>
  );

  return (
    <AdminFrame user={user} title={t("staff.title")}>
      <div className="space-y-4">
        <Card title={t("staff.rolesTitle")}>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {ROLES.map((r) => <li key={r} className="rounded-xl bg-mist p-3"><strong>{t(`roles.${r}`)}</strong> — <span className="text-ink-700">{t(`staff.roleInfo.${r}`)}</span> <span className="text-xs text-ink-500">({ROLE_PERMISSIONS[r].size})</span></li>)}
          </ul>
        </Card>
        {staff.map((u) => {
          const locked = !!u.lockedUntil && u.lockedUntil > new Date();
          return (
            <Card key={u.id} className={u.active ? "" : "opacity-75"} title={`${u.name}${u.id === user.id ? ` (${t("staff.you")})` : ""}`} actions={
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-sea-100 px-2 py-0.5 font-semibold text-sea-800">{t(`roles.${u.role}`)}</span>
                {!u.active && <span className="rounded-full bg-ink-100 px-2 py-0.5 font-semibold">{t("staff.inactive")}</span>}
                {locked && <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-danger"><Lock size={12} />{t("staff.locked")}</span>}
                <span className="text-ink-500">{t("staff.lastLogin")}: {fmt(u.lastLoginAt)}</span>
              </div>
            }>
              {form(u)}
              <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-ink-100 pt-3">
                <ActionButton action={resetStaffPassword} fields={{ id: u.id, mode: "email" }} label={t("staff.sendReset")} />
                <ActionButton action={resetStaffPassword} fields={{ id: u.id, mode: "temp" }} label={t("staff.tempPassword")} confirm={t("staff.tempConfirm")} />
                {locked && <ActionButton action={unlockStaff} fields={{ id: u.id }} label={t("staff.unlock")} />}
                {u.id !== user.id && (u.active
                  ? <ActionButton action={setStaffActive} fields={{ id: u.id, active: "false" }} label={t("staff.deactivate")} tone="danger" confirm={t("staff.deactivateConfirm")} />
                  : <ActionButton action={setStaffActive} fields={{ id: u.id, active: "true" }} label={t("staff.activate")} />)}
              </div>
            </Card>
          );
        })}
        <Card title={t("staff.add")}>{form()}</Card>
      </div>
    </AdminFrame>
  );
}

export default function StaffPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Staff /></Suspense>;
}
