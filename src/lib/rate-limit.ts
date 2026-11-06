import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/** Best-effort client IP (behind Vercel / a reverse proxy). */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Fixed-window rate limit stored in Postgres (works on Vercel and on a VPS without Redis).
 * Returns true when the request is allowed.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number) {
  const key = `${bucket}:${await clientIp()}`;
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}
