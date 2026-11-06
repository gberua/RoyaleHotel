"use server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ActionError, diff, gelToTetri, localized, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { settingsSchema } from "@/lib/settings-schema";
import { SETTINGS_SECTIONS } from "@/lib/admin/settings-fields";
import { updateRatesFromNbg } from "@/lib/currency/nbg";
import { refreshSite } from "@/lib/revalidate";

export async function saveSettings(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("settings", async (user) => {
    const section = SETTINGS_SECTIONS.find((s) => s.id === form.get("section"));
    if (!section) throw new ActionError("invalid_form");
    const row = await db.setting.findUnique({ where: { key: section.group } });
    const shape = settingsSchema.shape[section.group];
    const current = shape.parse(row?.value ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const fieldErrors: Record<string, string> = {};
    for (const f of section.fields) {
      const raw = String(form.get(f.key) ?? "").trim();
      switch (f.kind) {
        case "bool": patch[f.key] = form.get(f.key) === "on"; break;
        case "localized": case "localizedLong": patch[f.key] = localized(form, f.key); break;
        case "list": patch[f.key] = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean); break;
        case "money": patch[f.key] = gelToTetri(raw) ?? 0; break;
        case "int": case "percent": case "decimal": {
          if (raw === "") { patch[f.key] = current[f.key] === null ? null : 0; break; }
          const n = Number(raw.replace(",", "."));
          if (!Number.isFinite(n) || (f.kind !== "decimal" && !Number.isInteger(n))) fieldErrors[f.key] = "invalid";
          else if (f.kind === "percent" && (n < 0 || n > 100)) fieldErrors[f.key] = "too_big";
          else patch[f.key] = n;
          break;
        }
        default: patch[f.key] = raw;
      }
    }
    if (section.group === "notifications") {
      for (const e of patch.adminEmails as string[]) if (!z.email().safeParse(e).success) fieldErrors.adminEmails = "invalid_format";
      if (patch.telegramEnabled && !patch.telegramChatId) fieldErrors.telegramChatId = "required";
    }
    for (const k of ["email", "bookingEmail"]) if (k in patch && patch[k] && !z.email().safeParse(patch[k]).success) fieldErrors[k] = "invalid_format";
    if (Object.keys(fieldErrors).length) return { ok: false, error: "invalid_form", fieldErrors };
    const parsed = shape.safeParse({ ...current, ...patch });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.code === "too_big" ? "too_big" : i.code === "too_small" ? "too_small" : "invalid";
      return { ok: false, error: "invalid_form", fieldErrors: fe };
    }
    const next = parsed.data as Record<string, unknown>;
    const d = diff(current, next);
    if (!d.changed.length) return { ok: true, message: "no_changes" };
    await db.setting.upsert({ where: { key: section.group }, create: { key: section.group, value: next as Prisma.InputJsonValue }, update: { value: next as Prisma.InputJsonValue } });
    await logActivity({ userId: user.id, action: `settings.${section.id}`, entity: "Setting", entityId: section.group, summary: `Settings › ${section.id}: ${d.changed.join(", ")}`, before: d.before, after: d.after });
    refreshSite("settings", "content", "rooms");
  });
}

/** Admins type "1 USD = 2.59 ₾"; we store units per 1 GEL. */
export async function saveCurrencies(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("settings", async (user) => {
    const rows = await db.currency.findMany({ where: { isBase: false } });
    const before: Record<string, string> = {}, after: Record<string, string> = {};
    const fieldErrors: Record<string, string> = {};
    const updates: { code: string; rate: Prisma.Decimal; enabled: boolean }[] = [];
    for (const c of rows) {
      const n = Number(String(form.get(`gelPer.${c.code}`) ?? "").replace(",", "."));
      if (!Number.isFinite(n) || n <= 0 || n > 100) { fieldErrors[`gelPer.${c.code}`] = "invalid"; continue; }
      const rate = new Prisma.Decimal(1 / n).toDecimalPlaces(6);
      const enabled = form.get(`enabled.${c.code}`) === "on";
      if (!rate.equals(c.rate) || enabled !== c.enabled) { before[c.code] = `${c.rate} ${c.enabled ? "on" : "off"}`; after[c.code] = `${rate} ${enabled ? "on" : "off"}`; }
      updates.push({ code: c.code, rate, enabled });
    }
    if (Object.keys(fieldErrors).length) return { ok: false, error: "invalid_form", fieldErrors };
    await db.$transaction(updates.map((u) => db.currency.update({ where: { code: u.code }, data: { rate: u.rate, enabled: u.enabled } })));
    const autoUpdate = form.get("autoUpdate") === "on";
    const row = await db.setting.findUnique({ where: { key: "currency" } });
    const cur = settingsSchema.shape.currency.parse(row?.value ?? {});
    if (cur.autoUpdate !== autoUpdate) { before.autoUpdate = String(cur.autoUpdate); after.autoUpdate = String(autoUpdate); }
    const value = { ...cur, autoUpdate };
    await db.setting.upsert({ where: { key: "currency" }, create: { key: "currency", value }, update: { value } });
    if (Object.keys(after).length) await logActivity({ userId: user.id, action: "settings.currency", entity: "Currency", summary: `Exchange rates / currency options changed (${Object.keys(after).join(", ")})`, before, after });
    refreshSite("currencies", "settings");
  });
}

export async function updateFromNbg(): Promise<ActionResult> {
  return staffAction("settings", async (user) => {
    try { await updateRatesFromNbg(user.id); }
    catch (e) { console.error("[nbg]", e); throw new ActionError("nbg_failed"); }
    refreshSite("currencies", "settings");
    return { ok: true, message: "rates_updated" };
  });
}
