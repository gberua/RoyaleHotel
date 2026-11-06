"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { requestReset, resetPassword } from "@/app/admin/account/actions";
import type { ActionResult } from "./ui";

/** Forgot-password and set-new-password forms (before login). */
export function AuthForms({ mode, token = "", valid = true }: { mode: "forgot" | "reset"; token?: string; valid?: boolean }) {
  const t = useTranslations("admin.auth");
  const te = useTranslations("admin.errors");
  const [state, action, pending] = useActionState<ActionResult, FormData>(mode === "forgot" ? requestReset : resetPassword, { ok: true });
  const back = <p className="text-center text-sm"><Link href="/admin/login" className="font-semibold text-sea-700 hover:underline">{t("backToLogin")}</Link></p>;
  if (mode === "reset" && !valid) return <div className="space-y-4"><p role="alert" className="text-sm text-danger">{te("token_invalid")}</p><p className="text-center text-sm"><Link href="/admin/forgot" className="font-semibold text-sea-700 hover:underline">{t("requestNew")}</Link></p></div>;
  if (state.ok && state.message) return <div className="space-y-4"><p role="status" className="rounded-xl bg-sea-50 p-3 text-sm text-ink-900">{t(`msg.${state.message}`)}</p>{back}</div>;
  const err = !state.ok ? te.has(state.error) ? te(state.error) : te("unexpected") : null;
  return (
    <form action={action} className="space-y-4">
      {mode === "forgot" ? (
        <>
          <p className="text-sm text-ink-700">{t("forgotIntro")}</p>
          <div><label className="label" htmlFor="email">{t("email")}</label><input id="email" name="email" type="email" autoComplete="username" required className="field" /></div>
        </>
      ) : (
        <>
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-ink-700">{t("passwordRules")}</p>
          <div><label className="label" htmlFor="password">{t("newPassword")}</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="field" /></div>
          <div><label className="label" htmlFor="confirm">{t("confirmPassword")}</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="field" /></div>
        </>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button disabled={pending} className="btn btn-primary w-full">{mode === "forgot" ? t("sendLink") : t("setPassword")}</button>
      {back}
    </form>
  );
}
