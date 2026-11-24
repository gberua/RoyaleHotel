import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { BookingError } from "@/lib/booking/service";
import { currentStaff, type StaffUser } from "./admin-auth";
import { can, type Permission, type RoleName } from "./permissions";

/**
 * Result of every admin form action. `error` and `fieldErrors` are translation keys
 * (admin.errors.*), rendered in the admin's own language by the client.
 */
export type ActionResult<T = unknown> = { ok: true; message?: string; values?: Record<string, string | number>; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string>; values?: Record<string, string | number> };

export class ActionError extends Error {
  constructor(public key: string, public values?: Record<string, string | number>) {
    super(key);
  }
}

function zodFieldErrors(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const key = i.path.join(".") || "_";
    if (out[key]) continue;
    const input = (i as { input?: unknown }).input;
    out[key] =
      i.message && !i.message.includes(" ") ? i.message
      : i.code === "too_small" ? (input === "" || input == null ? "required" : "too_small")
      : i.code === "too_big" ? "too_big"
      : i.code === "invalid_format" ? "invalid_format"
      : input === "" || input == null ? "required" : "invalid";
  }
  return out;
}

/**
 * Wraps an admin server action: checks the user's permission on the server (null = any signed-in staff), runs the handler and converts
 * validation / domain errors into translatable results.
 */
export async function staffAction<T>(permission: Permission | null, fn: (user: StaffUser) => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
  const user = await currentStaff();
  if (!user) return { ok: false, error: "session_expired" };
  if (permission && !can(user.role as RoleName, permission)) return { ok: false, error: "forbidden" };
  try {
    const result = (await fn(user)) ?? { ok: true as const };
    // the admin screens are never cached, but the router must re-render them to show the change
    if (result.ok) revalidatePath("/admin", "layout");
    return result;
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: "invalid_form", fieldErrors: zodFieldErrors(e) };
    if (e instanceof ActionError) return { ok: false, error: e.key, values: e.values };
    if (e instanceof BookingError) return { ok: false, error: `booking_${e.code}` };
    console.error("[admin action]", e);
    return { ok: false, error: "unexpected" };
  }
}

/** FormData → plain object (repeated keys become arrays) for zod parsing. */
export function formObject(form: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], val);
    else out[k] = val;
  }
  return out;
}

/** Localized field from inputs named `${name}.ka|en|ru`. */
export function localized(form: FormData, name: string, required = false) {
  const v = { ka: String(form.get(`${name}.ka`) ?? "").trim(), en: String(form.get(`${name}.en`) ?? "").trim(), ru: String(form.get(`${name}.ru`) ?? "").trim() };
  if (required && !v.ka && !v.en) throw new z.ZodError([{ code: "custom", path: [`${name}.ka`], message: "required_ka_or_en", input: "" }]);
  return v;
}

/** "120.50" (GEL) → 12050 tetri. Empty → null. */
export function gelToTetri(v: FormDataEntryValue | null, required = false): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) {
    if (required) throw new ActionError("price_required");
    return null;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new ActionError("price_invalid");
  return Math.round(n * 100);
}

/** A room price: 0 is always a typo and would put free rooms on sale. */
export function roomPrice<T extends number | null>(tetri: T): T {
  if (tetri !== null && tetri <= 0) throw new ActionError("price_invalid");
  return tetri;
}

/** Shallow diff for the activity log: only changed keys, old → new. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k]; a[k] = after[k]; }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}
