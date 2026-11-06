import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";
import { can, homeFor, type Permission, type RoleName } from "./permissions";
import type { Role } from "@/generated/prisma/client";

export type StaffUser = { id: string; name: string; email: string; role: Role; adminLocale: string };

/** Current staff user, re-read from the database on every request (deactivation / role / password changes apply at once). */
export async function currentStaff(): Promise<StaffUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true, active: true, adminLocale: true, passwordChangedAt: true } });
  if (!user?.active) return null;
  // sessions issued before a password change / reset are no longer valid
  const issued = (session as unknown as { pwdAt?: number }).pwdAt ?? 0;
  if (user.passwordChangedAt.getTime() > issued + 1000) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, adminLocale: user.adminLocale };
}

/** Page / action guard: signed in AND allowed. Never rely on hidden buttons alone. */
export async function requirePermission(permission: Permission): Promise<StaffUser> {
  const user = await currentStaff();
  if (!user) redirect("/admin/login");
  if (!can(user.role as RoleName, permission)) redirect(`${homeFor(user.role as RoleName)}?denied=1`);
  return user;
}
