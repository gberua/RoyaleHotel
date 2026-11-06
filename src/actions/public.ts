"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export type FormState = { ok: boolean; error?: "rateLimited" | "error" | "invalid"; fieldErrors?: Record<string, string> };

const text = (min: number, max: number) => z.string().trim().min(min, "tooShort").max(max, "tooLong");

function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0]);
    if (!out[key]) out[key] = issue.code === "invalid_format" ? "invalidEmail" : issue.message === "tooLong" ? "tooLong" : issue.input === "" || issue.input == null ? "required" : issue.message;
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
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true }; // silently drop bots
    return { ok: false, error: "invalid", fieldErrors: fieldErrors(parsed.error) };
  }
  if (!(await rateLimit("contact", 5, 600))) return { ok: false, error: "rateLimited" };
  const { name, email, phone, subject, message, locale } = parsed.data;
  try {
    await db.contactMessage.create({ data: { name, email, phone: phone || null, subject: subject || null, message, locale, ip: await clientIp() } });
    // Phase (d): notify reception by email + Telegram here.
    return { ok: true };
  } catch {
    return { ok: false, error: "error" };
  }
}

const reviewSchema = z.object({
  authorName: text(2, 80),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  rating: z.coerce.number().int().min(1, "required").max(5),
  body: text(20, 3000),
  stayMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().or(z.literal("")),
  locale: z.string().max(5).optional(),
  website: z.string().max(0).optional(),
});

export async function submitReview(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true };
    return { ok: false, error: "invalid", fieldErrors: fieldErrors(parsed.error) };
  }
  if (!(await rateLimit("review", 3, 3600))) return { ok: false, error: "rateLimited" };
  const d = parsed.data;
  try {
    // Always PENDING: nothing appears publicly until staff approve it in /admin/reviews
    await db.review.create({
      data: { source: "DIRECT", status: "PENDING", authorName: d.authorName, country: d.country || null, rating: d.rating, body: d.body, stayMonth: d.stayMonth || null, locale: d.locale },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "error" };
  }
}
