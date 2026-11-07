// Dev-only: download a booking's registration card + invoice as the owner. Usage: node --env-file=.env scripts/dev/fetch-docs.mjs CODE OUTDIR
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const [code, out] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
await p.goto("http://localhost:3000/admin/login"); await p.fill("#email", process.env.SEED_OWNER_EMAIL); await p.fill("#password", process.env.SEED_OWNER_PASSWORD);
await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.includes("login"));
for (const [doc, l] of [["registration", "ka"], ["invoice", "ru"]]) {
  const r = await p.request.get(`http://localhost:3000/admin/bookings/${code}/${doc}?lang=${l}`);
  await writeFile(`${out}/${doc}-${l}.pdf`, await r.body()); console.log(doc, l, r.status());
}
await b.close();
