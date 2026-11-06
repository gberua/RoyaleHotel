import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentStaff } from "@/lib/admin-auth";
import { adminT, ADMIN_LOCALES } from "@/lib/admin-i18n";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminForm, Card, SelectInput, TextInput } from "@/components/admin/ui";
import { changeOwnPassword, updateProfile } from "./actions";

export const metadata: Metadata = { title: "My account" };

async function Account() {
  await connection();
  const user = await currentStaff();
  if (!user) redirect("/admin/login");
  const t = await adminT(user.adminLocale);
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return (
    <AdminFrame user={user} title={t("account.title")}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("account.profile")}>
          <AdminForm action={updateProfile} submit={t("common.save")} className="space-y-3">
            <TextInput label={t("staff.name")} name="name" defaultValue={me.name} required />
            <TextInput label={t("staff.phone")} name="phone" type="tel" defaultValue={me.phone} />
            <SelectInput label={t("account.language")} name="adminLocale" defaultValue={me.adminLocale} options={ADMIN_LOCALES.map((l) => ({ value: l, label: t(`langs.${l}`) }))} hint={t("account.languageHint")} />
            <p className="text-xs text-ink-500">{t("staff.email")}: {me.email} · {t(`roles.${me.role}`)}</p>
          </AdminForm>
        </Card>
        <Card title={t("account.password")}>
          <AdminForm action={changeOwnPassword} submit={t("account.changePassword")} resetOnSuccess className="space-y-3">
            <p className="text-xs text-ink-500">{t("auth.passwordRules")}</p>
            <TextInput label={t("account.current")} name="current" type="password" required />
            <TextInput label={t("auth.newPassword")} name="password" type="password" required />
            <TextInput label={t("auth.confirmPassword")} name="confirm" type="password" required />
          </AdminForm>
        </Card>
      </div>
    </AdminFrame>
  );
}

export default function AccountPage() {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Account /></Suspense>;
}
