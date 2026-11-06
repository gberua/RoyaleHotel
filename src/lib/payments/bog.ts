import "server-only";
import type { PaymentProvider, PaymentStatus } from "./types";

/**
 * Bank of Georgia — Payments API (iPay successor) adapter. Ready for merchant credentials:
 *   BOG_CLIENT_ID, BOG_CLIENT_SECRET, BOG_AUTH_URL, BOG_API_BASE (defaults below; use the test values BOG gives you)
 * Flow: OAuth2 client-credentials → POST /ecommerce/orders → redirect guest to _links.redirect.href →
 * BOG POSTs the order to the callback URL → we GET /receipt/{order_id} for the real status.
 * ⚠️ Verify field names against BOG's developer docs during onboarding.
 */
const AUTH = () => process.env.BOG_AUTH_URL ?? "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
const API = () => (process.env.BOG_API_BASE ?? "https://api.bog.ge/payments/v1").replace(/\/$/, "");
let cached: { token: string; exp: number } | null = null;

async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(`${process.env.BOG_CLIENT_ID}:${process.env.BOG_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(AUTH(), { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!res.ok) throw new Error(`BOG token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 300) * 1000 };
  return cached.token;
}

async function call<T>(path: string, init: RequestInit = {}, lang = "en"): Promise<T> {
  const res = await fetch(`${API()}${path}`, { ...init, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "Accept-Language": lang, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`BOG ${path} ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

const STATUS: Record<string, PaymentStatus> = { completed: "succeeded", rejected: "failed", refunded: "cancelled", refunded_partially: "succeeded", processing: "pending", created: "pending", blocked: "pending" };

export const bogProvider: PaymentProvider = {
  id: "bog",
  configured: () => !!(process.env.BOG_CLIENT_ID && process.env.BOG_CLIENT_SECRET),
  async createPayment(i) {
    const total = i.amount / 100;
    const j = await call<{ id: string; _links: { redirect: { href: string } } }>("/ecommerce/orders", {
      method: "POST",
      body: JSON.stringify({
        callback_url: i.callbackUrl, external_order_id: i.paymentId, ttl: i.ttlMinutes,
        purchase_units: { currency: "GEL", total_amount: total, basket: [{ quantity: 1, unit_price: total, product_id: i.bookingId, description: i.description }] },
        redirect_urls: { success: i.returnUrl, fail: i.returnUrl },
      }),
    }, i.locale === "ka" ? "ka" : "en");
    return { providerRef: j.id, redirectUrl: j._links.redirect.href, raw: j };
  },
  async fetchStatus(ref) {
    const j = await call<{ order_status: { key: string }; purchase_units?: { transfer_amount?: string } }>(`/receipt/${encodeURIComponent(ref)}`);
    const amount = j.purchase_units?.transfer_amount ? Math.round(Number(j.purchase_units.transfer_amount) * 100) : undefined;
    return { status: STATUS[j.order_status.key] ?? "pending", amount, raw: j };
  },
  async refund(ref, amount) {
    const j = await call<unknown>(`/payment/refund/${encodeURIComponent(ref)}`, { method: "POST", body: JSON.stringify({ amount: amount / 100 }) });
    return { ok: true, raw: j };
  },
};
