// Dev-only: checks the home page animations in real browser engines and conditions.
// Usage: node scripts/dev/motion-audit.mjs [baseUrl]   (default: the live site)
import { chromium, firefox, webkit, devices } from "@playwright/test";

const base = process.argv[2] ?? "https://royale-hotel-eta.vercel.app";
const scenarios = [
  { name: "iPhone Safari", engine: webkit, ctx: { ...devices["iPhone 15"] } },
  { name: "Android Chrome", engine: chromium, ctx: { ...devices["Pixel 7"] } },
  { name: "Desktop Safari", engine: webkit, ctx: { viewport: { width: 1440, height: 900 } } },
  { name: "Desktop Firefox", engine: firefox, ctx: { viewport: { width: 1440, height: 900 } } },
  { name: "Desktop Chrome", engine: chromium, ctx: { viewport: { width: 1440, height: 900 } } },
  { name: "Reduce motion (iPhone)", engine: webkit, ctx: { ...devices["iPhone 15"], reducedMotion: "reduce" } },
  { name: "Reduce motion (Chrome)", engine: chromium, ctx: { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" } },
  { name: "Slow 3G + Save-Data (Android)", engine: chromium, ctx: { ...devices["Pixel 7"], extraHTTPHeaders: { "Save-Data": "on" } }, slow: true },
  { name: "JavaScript off", engine: chromium, ctx: { ...devices["Pixel 7"], javaScriptEnabled: false } },
  { name: "Page scripts fail to load", engine: webkit, ctx: { ...devices["iPhone 15"] }, blockJs: true },
  { name: "No IntersectionObserver", engine: chromium, ctx: { ...devices["Pixel 7"] }, noIO: true },
];

const results = [];
for (const s of scenarios) {
  const browser = await s.engine.launch();
  const ctx = await browser.newContext(s.ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem("rh_consent", "essential"); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  if (s.blockJs) await page.route(/\/_next\/static\/chunks\/.*\.js/, (r) => r.abort());
  if (s.noIO) await page.addInitScript(() => { delete window.IntersectionObserver; });
  if (s.slow) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, connectionType: "cellular3g" });
  }
  // record every animation that ever runs (CSS animations/transitions, scroll-driven, WAAPI)
  await page.addInitScript(() => {
    window.__anims = new Set();
    const tick = () => { for (const a of document.getAnimations()) { const t = a.effect?.target; if (t) window.__anims.add((t.className?.baseVal ?? t.className ?? "").toString().split(" ").find((c) => /reveal|hero|kenburns|scroll-dot|is-visible/.test(c)) ?? t.tagName); } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.goto(`${base}/en`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(800);
  const js = s.ctx.javaScriptEnabled !== false;
  const early = !js ? { letterAnim: "(no JS check)", kenburns: "-", video: false, hiddenBelow: 0 } : await page.evaluate(() => {
    const letters = [...document.querySelectorAll("h1 .hero-letter")];
    const kb = document.querySelector(".hero-kenburns");
    const h1 = document.querySelector("h1");
    const below = [...document.querySelectorAll(".reveal")].filter((e) => e.getBoundingClientRect().top > innerHeight);
    return {
      letterAnim: `${letters[0] ? getComputedStyle(letters[0]).animationName : "-"} / h1 ${getComputedStyle(h1).animationName}`,
      kenburns: kb ? getComputedStyle(kb).animationName : "-", video: !!document.querySelector("section video"),
      hiddenBelow: below.filter((e) => Number(getComputedStyle(e).opacity) < 0.1).length,
    };
  });
  await page.waitForTimeout(3500);
  if (!js) {
    const vis = await page.evaluate(() => [...document.querySelectorAll(".reveal")].filter((e) => Number(getComputedStyle(e).opacity) < 0.9).length).catch(() => "?");
    results.push({ scenario: s.name, titleAnim: "-", titleVisible: "-", kenBurns: "-", revealAnimated: false, revealEls: "-", stuckInvisible: vis, errors: "-" });
    await browser.close(); continue;
  }
  const title = await page.evaluate(() => { const l = [...document.querySelectorAll("h1 .hero-letter")].at(-1); const h = document.querySelector("h1"); return { lastLetterOpacity: l ? Number(getComputedStyle(l).opacity) : Number(getComputedStyle(h).opacity) }; });
  // scroll through the page like a visitor
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) { await page.mouse.wheel(0, 400).catch(() => page.evaluate((yy) => window.scrollTo(0, yy), y)); await page.waitForTimeout(250); }
  await page.waitForTimeout(1200);
  const reveal = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".reveal")];
    const hidden = els.filter((e) => { const r = e.getBoundingClientRect(); return Number(getComputedStyle(e).opacity) < 0.5 && r.top < innerHeight && r.bottom > 0; }).length;
    window.scrollTo(0, 0);
    return { total: els.length, hiddenInView: hidden };
  });
  // anything stuck invisible after visiting every part of the page?
  const stuck = await page.evaluate(async () => {
    let n = 0;
    for (const e of document.querySelectorAll(".reveal")) { e.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 400)); if (Number(getComputedStyle(e).opacity) < 0.9) n++; }
    return n;
  });
  const anims = await page.evaluate(() => [...window.__anims]);
  results.push({
    scenario: s.name, loadMs: Date.now() - t0,
    titleAnim: early.letterAnim, titleVisible: title.lastLetterOpacity >= 0.99, kenBurns: early.kenburns,
    revealAnimated: anims.some((a) => /reveal|is-visible/.test(a)), revealEls: reveal.total, waitingBelowFold: early.hiddenBelow, stuckInvisible: stuck,
    errors: errors.length ? errors.slice(0, 3).join(" | ") : "none",
  });
  await browser.close();
}
console.table(results);
