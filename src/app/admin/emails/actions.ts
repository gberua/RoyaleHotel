"use server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ActionError, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity, loadSettings } from "@/lib/booking/service";
import { settingsSchema } from "@/lib/settings-schema";
import { sendMail } from "@/lib/notify/email";
import { TEMPLATE_KEYS, fill, loadTemplate, templateHtml, templateVars } from "@/lib/notify/templates";

const LOCALES = ["ka", "en", "ru"] as const;

/** Saves one template in one language; an empty body goes back to the built-in text. */
export async function saveTemplate(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const f = z.object({ key: z.enum(TEMPLATE_KEYS), locale: z.enum(LOCALES), subject: z.string().trim().max(200).optional(), body: z.string().trim().max(5000).optional() }).parse(Object.fromEntries(form));
    const before = await loadTemplate(f.key, f.locale);
    if (!f.body) {
      await db.emailTemplate.deleteMany({ where: { key: f.key, locale: f.locale } });
      await logActivity({ userId: user.id, action: "template.reset", entity: "EmailTemplate", entityId: `${f.key}/${f.locale}`, summary: `Template ${f.key} (${f.locale}) reset to the built-in text` });
      return { ok: true, message: "template_reset" };
    }
    if (f.key !== "whatsapp" && !f.subject) throw new z.ZodError([{ code: "custom", path: ["subject"], message: "required", input: "" }]);
    const data = { subject: f.subject ?? "", body: f.body };
    await db.emailTemplate.upsert({ where: { key_locale: { key: f.key, locale: f.locale } }, create: { key: f.key, locale: f.locale, ...data }, update: data });
    await logActivity({ userId: user.id, action: "template.update", entity: "EmailTemplate", entityId: `${f.key}/${f.locale}`, summary: `Template ${f.key} (${f.locale}) updated`, before: { subject: before.subject, body: before.body }, after: data });
  });
}

export async function saveAutomation(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const f = z.object({ preArrivalDays: z.coerce.number().int().min(1).max(30), postStayDays: z.coerce.number().int().min(0).max(30) }).parse(Object.fromEntries(form));
    const row = await db.setting.findUnique({ where: { key: "automation" } });
    const before = settingsSchema.shape.automation.parse(row?.value ?? {});
    const value = { ...before, ...f, preArrivalEnabled: form.get("preArrivalEnabled") === "on", postStayEnabled: form.get("postStayEnabled") === "on" };
    await db.setting.upsert({ where: { key: "automation" }, create: { key: "automation", value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
    await logActivity({ userId: user.id, action: "settings.automation", entity: "Setting", entityId: "automation", summary: "Automatic e-mail settings changed", before, after: value });
  });
}

/** Sends the template (filled with the latest real booking, or sample data) to the signed-in staff member. */
export async function sendTestTemplate(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("content", async (user) => {
    const f = z.object({ key: z.enum(["pre_arrival", "post_stay"]), locale: z.enum(LOCALES) }).parse(Object.fromEntries(form));
    const settings = await loadSettings();
    const sample = (await db.booking.findFirst({ where: { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } }, orderBy: { createdAt: "desc" }, include: { guest: { select: { firstName: true } } } }))
      ?? { code: "RH-2027-0001", checkIn: new Date("2027-07-10"), checkOut: new Date("2027-07-13"), guest: { firstName: "Nino" } };
    const tpl = await loadTemplate(f.key, f.locale);
    const vars = templateVars({ ...sample, locale: f.locale }, settings);
    const res = await sendMail({ to: user.email, subject: `[TEST] ${fill(tpl.subject, vars)}`, html: templateHtml(fill(tpl.body, vars), settings, f.locale), text: fill(tpl.body, vars) });
    if (!res.ok) throw new ActionError("email_failed");
    return { ok: true, message: "test_sent", values: { email: user.email } };
  });
}

