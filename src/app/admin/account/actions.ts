"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ActionError, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { checkPassword, createResetToken, findResetToken, setPassword } from "@/lib/admin/passwords";
import { sendResetMail } from "@/lib/admin/staff-mail";
import { ADMIN_LOCALES, isAdminLocale } from "@/lib/admin-i18n-shared";
import { rateLimit } from "@/lib/rate-limit";
import { signIn } from "@/auth";

export async function updateProfile(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction(null, async (user) => {
    const f = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(40).optional(), adminLocale: z.enum(ADMIN_LOCALES) }).parse(Object.fromEntries(form));
    await db.user.update({ where: { id: user.id }, data: { name: f.name, phone: f.phone || null, adminLocale: f.adminLocale } });
    (await cookies()).set("rh_admin_lang", f.adminLocale, { path: "/admin", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    await logActivity({ userId: user.id, action: "account.update", entity: "User", entityId: user.id, summary: `${f.name} updated own profile`, before: { name: user.name, adminLocale: user.adminLocale }, after: { name: f.name, adminLocale: f.adminLocale } });
  });
}

/** Changing the own password signs out every other session; this browser signs in again with the new password. */
export async function changeOwnPassword(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction(null, async (user) => {
    const current = String(form.get("current") ?? "");
    const next = String(form.get("password") ?? "");
    checkPassword(next, String(form.get("confirm") ?? ""));
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(current, row.passwordHash))) throw new z.ZodError([{ code: "custom", path: ["current"], message: "wrong_password", input: "" }]);
    if (await bcrypt.compare(next, row.passwordHash)) throw new ActionError("password_same");
    await setPassword(user.id, next);
    await logActivity({ userId: user.id, action: "account.password", entity: "User", entityId: user.id, summary: `${user.name} changed own password` });
    await signIn("credentials", { email: user.email, password: next, redirect: false });
    return { ok: true, message: "password_changed" };
  });
}

// ───────────────────────── before login (no session) ─────────────────────────

export async function setGuestLanguage(form: FormData) {
  const l = form.get("lang");
  if (isAdminLocale(l)) (await cookies()).set("rh_admin_lang", l, { path: "/admin", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const back = String(form.get("back") ?? "/admin/login");
  redirect(back.startsWith("/admin/") ? back : "/admin/login");
}

/** Always answers the same way, so it can't be used to find out which e-mails have accounts. */
export async function requestReset(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const email = z.email().max(200).safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { ok: false, error: "invalid_form", fieldErrors: { email: "invalid_format" } };
  if (!(await rateLimit("admin-reset", 5, 3600))) return { ok: false, error: "rate_limited" };
  const user = await db.user.findUnique({ where: { email: email.data } });
  if (user?.active) {
    await sendResetMail(user, await createResetToken(user.id));
    await logActivity({ userId: user.id, action: "auth.reset_requested", entity: "User", entityId: user.id, summary: `Password reset requested for ${user.email}` });
  }
  return { ok: true, message: "reset_requested" };
}

export async function resetPassword(_p: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await rateLimit("admin-reset-use", 20, 3600))) return { ok: false, error: "rate_limited" };
  const token = await findResetToken(String(form.get("token") ?? ""));
  if (!token) return { ok: false, error: "token_invalid" };
  try { checkPassword(String(form.get("password") ?? ""), String(form.get("confirm") ?? "")); }
  catch (e) { return { ok: false, error: (e as ActionError).key }; }
  await setPassword(token.userId, String(form.get("password")));
  await db.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  await logActivity({ userId: token.userId, action: "auth.password_reset", entity: "User", entityId: token.userId, summary: `Password set via reset link for ${token.user.email}` });
  return { ok: true, message: "password_set" };
}
