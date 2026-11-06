import { syncPaymentByRef } from "@/lib/payments";

/**
 * Server-to-server payment notifications (TBC: {PaymentId}; BOG: {body:{order_id}}).
 * The body is only used to know WHICH payment changed — the status is always re-read from the provider.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/payments/[provider]/callback">) {
  const { provider } = await ctx.params;
  if (!["tbc", "bog"].includes(provider)) return new Response("unknown provider", { status: 404 });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const ref =
    provider === "tbc"
      ? String(body.PaymentId ?? body.paymentId ?? "")
      : String((body.body as Record<string, unknown> | undefined)?.order_id ?? body.order_id ?? "");
  if (!ref) return new Response("missing reference", { status: 400 });
  try {
    const status = await syncPaymentByRef(provider, ref);
    return Response.json({ ok: true, status });
  } catch (e) {
    console.error("[payments] callback error", provider, e);
    return new Response("error", { status: 500 }); // provider will retry
  }
}
