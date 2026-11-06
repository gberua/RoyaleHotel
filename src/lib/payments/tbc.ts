import "server-only";
import type { PaymentProvider, PaymentStatus } from "./types";

/**
 * TBC Bank — TBC Checkout (tpay) adapter. Ready for merchant credentials:
 *   TBC_API_KEY, TBC_CLIENT_ID, TBC_CLIENT_SECRET (sandbox or live), TBC_API_BASE (default https://api.tbcbank.ge)
 * Flow: access-token → POST /v1/tpay/payments → redirect guest to approval_url → TBC POSTs {PaymentId} to the
 * callback URL → we GET /v1/tpay/payments/{payId} to read the real status.
 * ⚠️ Field names follow TBC's published tpay API; verify against the docs in the merchant portal during onboarding.
 */
const base = () => (process.env.TBC_API_BASE ?? "https://api.tbcbank.ge").replace(/\/$/, "");
let cached: { token: string; exp: number } | null = null;

async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${base()}/v1/tpay/access-token`, {
    method: "POST",
    headers: { apikey: process.env.TBC_API_KEY!, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.TBC_CLIENT_ID!, client_secret: process.env.TBC_CLIENT_SECRET! }),
  });
  if (!res.ok) throw new Error(`TBC token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { apikey: process.env.TBC_API_KEY!, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`TBC ${path} ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

const STATUS: Record<string, PaymentStatus> = { succeeded: "succeeded", failed: "failed", expired: "cancelled", returned: "cancelled", cancelled: "cancelled", created: "pending", processing: "pending", waitingconfirm: "pending" };

export const tbcProvider: PaymentProvider = {
  id: "tbc",
  configured: () => !!(process.env.TBC_API_KEY && process.env.TBC_CLIENT_ID && process.env.TBC_CLIENT_SECRET),
  async createPayment(i) {
    const total = i.amount / 100;
    const j = await call<{ payId: string; links: { uri: string; rel: string }[] }>("/v1/tpay/payments", {
      method: "POST",
      body: JSON.stringify({
        amount: { currency: "GEL", total, subTotal: total, tax: 0, shipping: 0 },
        returnurl: i.returnUrl, callbackUrl: i.callbackUrl, merchantPaymentId: i.paymentId,
        expirationMinutes: i.ttlMinutes, language: i.locale === "ka" ? "KA" : "EN", preAuth: false, methods: [5, 7, 8], description: i.description.slice(0, 30),
      }),
    });
    const approval = j.links.find((l) => l.rel === "approval_url")?.uri;
    if (!approval) throw new Error("TBC: no approval_url");
    return { providerRef: j.payId, redirectUrl: approval, raw: j };
  },
  async fetchStatus(ref) {
    const j = await call<{ status: string; amount?: number }>(`/v1/tpay/payments/${encodeURIComponent(ref)}`);
    return { status: STATUS[j.status.toLowerCase()] ?? "pending", amount: j.amount != null ? Math.round(j.amount * 100) : undefined, raw: j };
  },
  async refund(ref, amount) {
    const j = await call<unknown>(`/v1/tpay/payments/${encodeURIComponent(ref)}/cancel`, { method: "POST", body: JSON.stringify({ amount: amount / 100 }) });
    return { ok: true, raw: j };
  },
};
