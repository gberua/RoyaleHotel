import { revalidateTag } from "next/cache";
import { runMaintenance } from "@/lib/maintenance";

/** Called every 15 minutes by Vercel Cron (vercel.json) or the in-process scheduler (instrumentation.ts). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const result = await runMaintenance();
  if (result.rates === "updated") revalidateTag("currencies", "max");
  return Response.json(result);
}
