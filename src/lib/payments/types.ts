/**
 * Payment provider adapter. Every provider (mock, TBC, Bank of Georgia, …) implements this interface;
 * the rest of the app never talks to a bank directly.
 *
 * Security rule: a callback / redirect is only a *signal*. The final status is always fetched from the
 * provider server-to-server (fetchStatus) before a booking is confirmed — callback bodies are never trusted.
 */
export type PaymentStatus = "succeeded" | "failed" | "cancelled" | "pending";

export type CreatePaymentInput = {
  paymentId: string; // our Payment row id (merchant order id)
  bookingId: string;
  amount: number; // GEL minor units (tetri)
  description: string;
  locale: string;
  returnUrl: string; // where the guest's browser comes back to
  callbackUrl: string; // server-to-server notification URL
  ttlMinutes: number;
};

export interface PaymentProvider {
  id: "mock" | "tbc" | "bog";
  /** Is the provider configured (keys present)? */
  configured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<{ redirectUrl: string; providerRef: string; raw?: unknown }>;
  fetchStatus(providerRef: string): Promise<{ status: PaymentStatus; amount?: number; raw?: unknown }>;
  refund(providerRef: string, amount: number): Promise<{ ok: boolean; raw?: unknown }>;
}
