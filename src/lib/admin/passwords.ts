import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/admin-action";

export const RESET_MINUTES = 60;

/** At least 10 characters with a letter and a digit. Throws a translatable error. */
export function checkPassword(pw: string, confirm?: string) {
  if (pw.length < 10 || pw.length > 200 || !/[A-Za-zა-ჰА-Яа-яЁё]/.test(pw) || !/\d/.test(pw)) throw new ActionError("password_weak");
  if (confirm !== undefined && pw !== confirm) throw new ActionError("password_mismatch");
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

/** New password → stored hash; sessions issued before now stop working; lock cleared. */
export async function setPassword(userId: string, pw: string) {
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } });
}

/** Readable temporary password, e.g. "sea-7Kx4-mPq9" */
export function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${(bytes[8] % 90) + 10}`;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** One-time reset token; only its hash is stored. Older unused tokens of the user are invalidated. */
export async function createResetToken(userId: string) {
  const raw = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordResetToken.create({ data: { userId, tokenHash: sha(raw), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) } }),
  ]);
  return raw;
}

export async function findResetToken(raw: string) {
  if (!raw || raw.length > 100) return null;
  const t = await db.passwordResetToken.findUnique({ where: { tokenHash: sha(raw) }, include: { user: true } });
  if (!t || t.usedAt || t.expiresAt < new Date() || !t.user.active) return null;
  return t;
}
