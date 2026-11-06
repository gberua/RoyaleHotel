"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { login } from "../actions";

export function LoginForm() {
  const t = useTranslations("admin.auth");
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">{t("email")}</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="password">{t("password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{t(`err.${state.error}`)}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? t("signingIn") : t("signIn")}</button>
      <p className="text-center text-sm"><Link href="/admin/forgot" className="font-semibold text-sea-700 hover:underline">{t("forgot")}</Link></p>
    </form>
  );
}
