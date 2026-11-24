"use server";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { notifyContactMessage } from "@/lib/notify/contact";

/** `values` hands back what the visitor typed, so a validation error never empties the form. */
export type FormState = { ok: boolean; error?: "rateLimited" | "error" | "invalid"; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const text = (min: number, max: number) => z.string().trim().min(min, "tooShort").max(max, "tooLong");

const submitted = (form: FormData) => Object.fromEntries([...form].filter((e): e is [string, string] => typeof e[1] === "string"));

function fieldErrors(err: z.ZodError, raw: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0]);
    if (out[key]) continue;
    // zod does not hand back the input, so "empty" is decided from what was actually submitted
    const empty = !(raw[key] ?? "").trim();
    out[key] = empty ? "required" : issue.code === "too_big" ? "tooLong" : issue.code === "too_small" ? "tooShort" : key === "email" ? "invalidEmail" : "required";
  }
  return out;
}

const contactSchema = z.object({
  name: text(2, 100),
  email: z.email("invalidEmail").max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(150).optional().or(z.literal("")),
  message: text(10, 4000),
  consent: z.literal("on", { message: "required" }),
  locale: z.string().max(5).optional(),
  website: z.string().max(0).optional(), // honeypot — must stay empty
});

export async function submitContact(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = submitted(form);
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true }; // silently drop bots
    return { ok: false, error: "invalid", fieldErrors: fieldErrors(parsed.error, raw), values: raw };
  }
  if (!(await rateLimit("contact", 5, 600))) return { ok: false, error: "rateLimited", values: raw };
  const { name, email, phone, subject, message, locale } = parsed.data;
  try {
    await db.contactMessage.create({ data: { name, email, phone: phone || null, subject: subject || null, message, locale, ip: await clientIp() } });
    // saved first (nothing is lost if mail is down), then sent to reception once the visitor has their answer
    after(() => notifyContactMessage({ name, email, phone, subject, message, locale }).catch((e) => console.error("[contact] notify failed", e)));
    return { ok: true };
  } catch {
    return { ok: false, error: "error", values: raw };
  }
}

const reviewSchema = z.object({
  authorName: text(2, 80),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  rating: z.coerce.number().int().min(1, "required").max(5),
  body: text(20, 3000),
  // optional: browsers without a month picker send free text — an unreadable month is dropped, never a reason to refuse the review
  stayMonth: z.string().regex(/^\d{4}-\d{2}$/).or(z.literal("")).optional().catch(""),
  locale: z.string().max(5).optional(),
  website: z.string().max(0).optional(),
});

export async function submitReview(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = submitted(form);
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true };
    return { ok: false, error: "invalid", fieldErrors: fieldErrors(parsed.error, raw), values: raw };
  }
  if (!(await rateLimit("review", 3, 3600))) return { ok: false, error: "rateLimited", values: raw };
  const d = parsed.data;
  try {
    // Always PENDING: nothing appears publicly until staff approve it in /admin/reviews
    await db.review.create({
      data: { source: "DIRECT", status: "PENDING", authorName: d.authorName, country: d.country || null, rating: d.rating, body: d.body, stayMonth: d.stayMonth || null, locale: d.locale },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "error", values: raw };
  }
}
