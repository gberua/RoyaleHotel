/**
 * In-process scheduler for self-hosting (VPS / Docker): runs the maintenance job every 15 minutes
 * (expire unpaid bookings, re-check payments, iCal sync). On Vercel use vercel.json crons instead and
 * leave ENABLE_INTERNAL_CRON unset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_INTERNAL_CRON !== "true") return;
  const g = globalThis as unknown as { __royaleCron?: NodeJS.Timeout };
  if (g.__royaleCron) return;
  const { runMaintenance } = await import("./lib/maintenance");
  const run = () => runMaintenance().catch((e) => console.error("[cron] maintenance failed", e));
  g.__royaleCron = setInterval(run, 15 * 60_000);
  setTimeout(run, 30_000);
  console.info("[cron] internal scheduler started (every 15 min)");
}
