import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Proves "this browser made / looked up this booking" without putting personal data in URLs.
 * Cookie value: <bookingId>.<expiry>.<HMAC-SHA256 signature>, httpOnly, SameSite=Lax (survives the
 * redirect back from the payment page).
 */
const NAME = "rh_booking";
const sign = (v: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "dev-secret").update(v).digest("base64url");

export async function grantBookingAccess(bookingId: string, hours = 6) {
  const exp = Date.now() + hours * 3_600_000;
  const value = `${bookingId}.${exp}`;
  (await cookies()).set(NAME, `${value}.${sign(value)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: hours * 3600,
  });
}

export async function bookingAccess(): Promise<string | null> {
  const raw = (await cookies()).get(NAME)?.value;
  if (!raw) return null;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export async function revokeBookingAccess() {
  (await cookies()).delete(NAME);
}
