"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ActionError, gelToTetri, staffAction, type ActionResult } from "@/lib/admin-action";
import { addDaysIso, isIsoDate, toDate } from "@/lib/booking/dates";
import { loadRateContext, logActivity } from "@/lib/booking/service";
import { bulkPlan, overrideFor, type BulkChange, type BulkOp } from "@/lib/booking/rates";
import { refreshSite } from "@/lib/revalidate";
import { tr } from "@/lib/i18n-content";

function parseBulk(form: FormData) {
  const p = z.object({
    from: z.string().refine(isIsoDate, "required"), to: z.string().refine(isIsoDate, "required"),
    op: z.enum(["set", "percent", "amount", "minStay", "close", "open", "closedToArrival", "openToArrival", "clear"]),
    value: z.string().max(20).optional(),
  }).parse(Object.fromEntries(form));
  const roomTypeIds = form.getAll("roomTypeId").map(String);
  const weekdays = form.getAll("weekday").map(Number).filter((n) => n >= 0 && n <= 6);
  if (!roomTypeIds.length) throw new ActionError("no_room_types");
  if (!weekdays.length) throw new ActionError("weekday_required");
  if (p.to < p.from) throw new ActionError("dates_invalid");
  if (Date.parse(p.to) - Date.parse(p.from) > 730 * 86_400_000) throw new ActionError("too_big");
  const num = () => {
    const n = Number(String(p.value ?? "").replace(",", "."));
    if (!String(p.value ?? "").trim() || !Number.isFinite(n)) throw new z.ZodError([{ code: "custom", path: ["value"], message: "required", input: p.value }]);
    return n;
  };
  let op: BulkOp;
  switch (p.op) {
    case "set": op = { kind: "set", price: gelToTetri(p.value ?? "", true)! }; break;
    case "percent": { const n = num(); if (n < -90 || n > 500) throw new ActionError("too_big"); op = { kind: "percent", value: n }; break; }
    case "amount": op = { kind: "amount", value: Math.round(num() * 100) }; break;
    case "minStay": { const n = p.value?.trim() ? Math.round(num()) : null; if (n != null && (n < 1 || n > 30)) throw new ActionError("too_big"); op = { kind: "minStay", value: n }; break; }
    case "close": op = { kind: "close" }; break;
    case "open": op = { kind: "open" }; break;
    case "closedToArrival": op = { kind: "closedToArrival", value: true }; break;
    case "openToArrival": op = { kind: "closedToArrival", value: false }; break;
    default: op = { kind: "clear" };
  }
  return { roomTypeIds, from: p.from, to: p.to, weekdays, op };
}

async function plan(form: FormData) {
  const spec = parseBulk(form);
  const ctx = await loadRateContext(spec.from, addDaysIso(spec.to, 1));
  const overrides = ctx.overrides;
  const changes = bulkPlan({ roomTypes: ctx.types, seasons: ctx.seasons, overrides, ...spec });
  return { spec, ctx, changes };
}

export type RatePreview = { count: number; rows: (BulkChange & { typeName: string })[]; byType: { typeName: string; count: number; oldAvg: number; newAvg: number }[] };

export async function previewRates(_p: ActionResult, form: FormData): Promise<ActionResult<RatePreview>> {
  return staffAction<RatePreview>("prices", async (user) => {
    const { ctx, changes } = await plan(form);
    if (!changes.length) throw new ActionError("no_dates");
    const names = new Map((await db.roomType.findMany({ where: { id: { in: ctx.types.map((t) => t.id) } } })).map((t) => [t.id, tr(t.name, user.adminLocale)]));
    const byType = [...new Set(changes.map((c) => c.roomTypeId))].map((id) => {
      const list = changes.filter((c) => c.roomTypeId === id);
      return { typeName: names.get(id) ?? id, count: list.length, oldAvg: Math.round(list.reduce((a, c) => a + c.oldPrice, 0) / list.length), newAvg: Math.round(list.reduce((a, c) => a + c.newPrice, 0) / list.length) };
    });
    return { ok: true, data: { count: changes.length, byType, rows: changes.slice(0, 80).map((c) => ({ ...c, typeName: names.get(c.roomTypeId) ?? c.roomTypeId })) } };
  });
}

/** Applies a bulk change. Only future bookings made AFTER this see the new prices — confirmed bookings keep theirs. */
export async function applyRates(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("prices", async (user) => {
    const { spec, ctx, changes } = await plan(form);
    if (!changes.length) throw new ActionError("no_dates");
    await db.$transaction(async (tx) => {
      for (const c of changes) {
        const rt = ctx.types.find((t) => t.id === c.roomTypeId)!;
        const o = overrideFor(c, rt, ctx.seasons);
        const where = { roomTypeId_date: { roomTypeId: c.roomTypeId, date: toDate(c.date) } };
        if (!o) await tx.rateOverride.deleteMany({ where: { roomTypeId: c.roomTypeId, date: toDate(c.date) } });
        else await tx.rateOverride.upsert({ where, update: o, create: { roomTypeId: c.roomTypeId, date: toDate(c.date), ...o } });
      }
    }, { timeout: 60_000 });
    const opText = spec.op.kind === "set" ? `set ${spec.op.price / 100} GEL` : spec.op.kind === "percent" ? `${spec.op.value > 0 ? "+" : ""}${spec.op.value}%` : spec.op.kind === "amount" ? `${spec.op.value > 0 ? "+" : ""}${spec.op.value / 100} GEL` : spec.op.kind === "minStay" ? `min stay ${spec.op.value ?? "default"}` : spec.op.kind;
    await logActivity({
      userId: user.id, action: "rates.bulk", entity: "RateOverride",
      summary: `Rates ${opText} for ${spec.from} → ${spec.to} (${changes.length} room-nights, weekdays ${spec.weekdays.join(",")})`,
      before: changes.slice(0, 200).map((c) => ({ t: c.roomTypeId, d: c.date, p: c.oldPrice, m: c.oldMinStay, x: c.oldClosed })),
      after: changes.slice(0, 200).map((c) => ({ t: c.roomTypeId, d: c.date, p: c.newPrice, m: c.newMinStay, x: c.newClosed })),
    });
    refreshSite("rooms");
    return { ok: true, message: "saved" };
  });
}
