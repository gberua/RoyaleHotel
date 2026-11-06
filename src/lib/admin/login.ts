import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
const DUMMY_HASH = "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";

export type LoginResult =
  | { ok: true; user: { id: string; email: string; name: string; role: string; passwordChangedAt: Date } }
  | { ok: false; reason: "unknown_email" | "inactive" | "wrong_password" | "wrong_password_locked" | "locked" };

/**
 * Checks staff credentials. Every failure is written to the activity log (with IP); 5 wrong passwords in a
 * row lock the account for 15 minutes — even the right password is refused while locked.
 */
export async function verifyLogin(emailRaw: string, password: string, ip: string | null): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  // always run bcrypt, even for unknown e-mails, so timing doesn't reveal which accounts exist
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
  if (user && user.active && ok && !locked) {
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } });
    return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, passwordChangedAt: user.passwordChangedAt } };
  }
  let reason: Exclude<LoginResult, { ok: true }>["reason"] = locked ? "locked" : !user ? "unknown_email" : !user.active ? "inactive" : "wrong_password";
  if (user && reason === "wrong_password") {
    const failed = user.failedLogins + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined } });
    if (failed >= LOCK_AFTER) reason = "wrong_password_locked";
  }
  await db.activityLog.create({ data: { userId: user?.id ?? null, action: "auth.login_failed", entity: "User", entityId: user?.id ?? null, summary: `Failed login for ${email} (${reason})`, ip } });
  return { ok: false, reason };
}
