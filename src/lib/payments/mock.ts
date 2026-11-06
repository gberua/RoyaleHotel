import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import type { PaymentProvider } from "./types";

/**
 * MOCK provider for testing the full flow without a bank. It "redirects" to our own /pay/mock page
 * where the tester chooses success, decline or cancel. Its status lives in the Payment row.
 * Disabled in production unless PAYMENTS_ALLOW_MOCK=true.
 */
export const mockProvider: PaymentProvider = {
  id: "mock",
  configured: () => process.env.NODE_ENV !== "production" || process.env.PAYMENTS_ALLOW_MOCK === "true",
  async createPayment(input) {
    const providerRef = `mock_${randomUUID()}`;
    const prefix = input.locale === "ka" ? "" : `/${input.locale}`;
    return { providerRef, redirectUrl: `${SITE_URL}${prefix}/pay/mock?ref=${providerRef}` };
  },
  async fetchStatus(providerRef) {
    const p = await db.payment.findFirst({ where: { providerRef } });
    const outcome = (p?.raw as { outcome?: string } | null)?.outcome;
    return { status: outcome === "success" ? "succeeded" : outcome === "fail" ? "failed" : outcome === "cancel" ? "cancelled" : "pending", amount: p?.amount };
  },
  async refund() {
    return { ok: true, raw: { mock: true } };
  },
};
