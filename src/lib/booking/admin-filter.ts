import type { Prisma } from "@/generated/prisma/client";

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW", "EXPIRED"] as const;
const STATUSES = BOOKING_STATUSES;

export function bookingFilter(sp: Record<string, string | string[] | undefined>): Prisma.BookingWhereInput {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const where: Prisma.BookingWhereInput = { NOT: { code: { startsWith: "HOLD-" } } };
  const status = one("status");
  if (status && (STATUSES as readonly string[]).includes(status)) where.status = status as (typeof STATUSES)[number];
  else if (!one("all")) where.status = { notIn: ["EXPIRED"] };
  if (one("source")) where.source = one("source") as never;
  if (one("from")) where.checkOut = { gt: new Date(one("from")) };
  if (one("to")) where.checkIn = { lt: new Date(one("to")) };
  const q = one("q").trim();
  if (q) where.OR = [{ code: { contains: q, mode: "insensitive" } }, { guest: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }];
  return where;
}

