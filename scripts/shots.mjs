// Usage: node scripts/shots.mjs <outDir> <path> [path...]  — mobile (390) + desktop (1440) full-page screenshots
import { chromium } from "playwright";
const [out, ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
for (const [name, vp] of [["m", { width: 390, height: 844 }], ["d", { width: 1440, height: 900 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: name === "m", hasTouch: name === "m" });
  await ctx.addInitScript(() => { try { localStorage.setItem("rh_consent", "essential"); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.addStyleTag({ content: ".reveal{animation:none!important}" });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate((w) => Math.max(window.innerWidth, document.documentElement.scrollWidth) - w, vp.width);
    const file = `${out}/${name}${p.replace(/[/?=&]/g, "_") || "_home"}.png`;
    await page.screenshot({ path: file, fullPage: true });
    // also slice tall pages into readable chunks
    const sharp = (await import("sharp")).default;
    const meta = await sharp(file).metadata();
    const chunk = name === "m" ? 1400 : 1100;
    for (let top = 0, i = 0; top < meta.height; top += chunk, i++) {
      await sharp(file).extract({ left: 0, top, width: meta.width, height: Math.min(chunk, meta.height - top) }).toFile(file.replace(".png", `.${i}.png`));
    }
    console.log(file, overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : "ok", errors.length ? "ERRORS: " + errors.join(" | ").slice(0, 400) : "");
    errors.length = 0;
  }
  await ctx.close();
}
await browser.close();
