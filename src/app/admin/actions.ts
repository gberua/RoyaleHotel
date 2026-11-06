"use server";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { homeFor, type RoleName } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

/** Returns translation keys (admin.auth.*) so the login screen shows errors in the chosen language. */
export async function login(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  if (!(await rateLimit("admin-login", 8, 900))) return { error: "rate_limited" };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  try {
    await signIn("credentials", { email, password: form.get("password"), redirect: false });
  } catch (e) {
    if (e instanceof AuthError) {
      const u = await db.user.findUnique({ where: { email }, select: { lockedUntil: true } }).catch(() => null);
      return { error: u?.lockedUntil && u.lockedUntil > new Date() ? "locked" : "login_failed" };
    }
    throw e;
  }
  const u = await db.user.findUnique({ where: { email }, select: { role: true, adminLocale: true } });
  redirect(homeFor((u?.role ?? "RECEPTION") as RoleName));
}

export async function logout() {
  await signOut({ redirectTo: "/admin/login" });
}
