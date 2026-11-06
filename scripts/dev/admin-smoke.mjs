// Dev-only: sign in as the seeded owner and open every admin screen, reporting server/client errors.
// Usage: node --env-file=.env scripts/dev/admin-smoke.mjs [baseUrl] [width]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3000";
const width = Number(process.argv[3] ?? 1366);
const pages = (process.env.PAGES ?? "/admin/bookings,/admin/calendar,/admin/rooms,/admin/rates,/admin/seasons,/admin/extras,/admin/promos,/admin/media,/admin/media?tab=rooms,/admin/media?tab=gallery,/admin/media?tab=home,/admin/staff,/admin/account,/admin/channels,/admin/activity").split(",");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${page.url()} ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`[console] ${page.url()} ${m.text().slice(0, 300)}`); });
await page.goto(`${base}/admin/login`);
await page.fill("#email", process.env.SEED_OWNER_EMAIL);
await page.fill("#password", process.env.SEED_OWNER_PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
for (const p of pages) {
  const res = await page.goto(base + p, { waitUntil: "networkidle", timeout: 90000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const h1 = await page.locator("h1").first().textContent().catch(() => "");
  console.log(`${res?.status()} ${p} h1="${(h1 ?? "").trim()}"${overflow > 1 ? ` OVERFLOW ${overflow}px` : ""}`);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${p.replace(/[^a-z0-9]+/gi, "_")}-${width}.png`, fullPage: false });
}
console.log(errors.length ? errors.join("\n") : "no client errors");
await browser.close();
