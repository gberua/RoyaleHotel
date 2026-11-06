"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ActionError, diff, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { createResetToken, hashPassword, setPassword, tempPassword } from "@/lib/admin/passwords";
import { sendResetMail } from "@/lib/admin/staff-mail";
import { ADMIN_LOCALES } from "@/lib/admin-i18n-shared";

const staffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(200).transform((s) => s.toLowerCase()),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(["OWNER", "MANAGER", "RECEPTION", "HOUSEKEEPING"]),
  adminLocale: z.enum(ADMIN_LOCALES),
});

async function assertOwnerRemains(changingId: string, nextRole: string, nextActive: boolean) {
  if (nextRole === "OWNER" && nextActive) return;
  const others = await db.user.count({ where: { role: "OWNER", active: true, NOT: { id: changingId } } });
  if (others === 0) throw new ActionError("last_owner");
}

export async function saveStaff(_p: ActionResult, form: FormData): Promise<ActionResult<{ password?: string }>> {
  return staffAction("staff", async (user) => {
    const id = String(form.get("id") ?? "");
    const f = staffSchema.parse(Object.fromEntries(form));
    const clash = await db.user.findFirst({ where: { email: f.email, NOT: id ? { id } : undefined } });
    if (clash) throw new z.ZodError([{ code: "custom", path: ["email"], message: "email_taken", input: f.email }]);
    const data = { name: f.name, email: f.email, phone: f.phone || null, role: f.role, adminLocale: f.adminLocale };
    if (id) {
      const before = await db.user.findUniqueOrThrow({ where: { id } });
      if (id === user.id && f.role !== before.role) throw new ActionError("self_role");
      await assertOwnerRemains(id, f.role, before.active);
      // a role change signs the person out so the new permissions apply on their next login
      await db.user.update({ where: { id }, data: { ...data, ...(f.role !== before.role ? { passwordChangedAt: new Date() } : {}) } });
      const d = diff({ name: before.name, email: before.email, phone: before.phone, role: before.role, adminLocale: before.adminLocale }, data);
      await logActivity({ userId: user.id, action: "staff.update", entity: "User", entityId: id, summary: `Staff ${f.name} updated (${d.changed.join(", ") || "no changes"})`, before: d.before, after: d.after });
      return { ok: true };
    }
    const sendInvite = form.get("invite") === "on";
    const password = tempPassword();
    const created = await db.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
    await logActivity({ userId: user.id, action: "staff.create", entity: "User", entityId: created.id, summary: `Staff ${f.name} (${f.role}) created`, after: data });
    if (sendInvite) {
      await sendResetMail(created, await createResetToken(created.id), true);
      return { ok: true, message: "invite_sent" };
    }
    return { ok: true, message: "staff_created", data: { password } };
  });
}

export async function setStaffActive(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("staff", async (user) => {
    const id = String(form.get("id"));
    const active = form.get("active") === "true";
    if (id === user.id && !active) throw new ActionError("self_deactivate");
    const before = await db.user.findUniqueOrThrow({ where: { id } });
    await assertOwnerRemains(id, before.role, active);
    // deactivation ends every open session at once
    await db.user.update({ where: { id }, data: { active, passwordChangedAt: active ? undefined : new Date(), lockedUntil: null, failedLogins: 0 } });
    await logActivity({ userId: user.id, action: active ? "staff.activate" : "staff.deactivate", entity: "User", entityId: id, summary: `Staff ${before.name} ${active ? "re-activated" : "deactivated"}`, before: { active: before.active }, after: { active } });
  });
}

/** Owner resets someone's password: either show a new temporary password or e-mail a reset link. */
export async function resetStaffPassword(_p: ActionResult, form: FormData): Promise<ActionResult<{ password?: string }>> {
  return staffAction("staff", async (user) => {
    const id = String(form.get("id"));
    const mode = form.get("mode") === "email" ? "email" : "temp";
    const target = await db.user.findUniqueOrThrow({ where: { id } });
    await logActivity({ userId: user.id, action: "staff.password_reset", entity: "User", entityId: id, summary: `Password reset for ${target.name} (${mode === "email" ? "e-mail link" : "temporary password"})` });
    if (mode === "email") {
      await sendResetMail(target, await createResetToken(id));
      return { ok: true, message: "reset_sent" };
    }
    const password = tempPassword();
    await setPassword(id, password);
    return { ok: true, message: "temp_password", data: { password } };
  });
}

export async function unlockStaff(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("staff", async (user) => {
    const id = String(form.get("id"));
    const u = await db.user.update({ where: { id }, data: { lockedUntil: null, failedLogins: 0 } });
    await logActivity({ userId: user.id, action: "staff.unlock", entity: "User", entityId: id, summary: `Account of ${u.name} unlocked` });
  });
}

