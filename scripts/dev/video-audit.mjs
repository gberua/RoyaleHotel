// Dev-only: hero video behaviour per device / condition. Usage: node scripts/dev/video-audit.mjs [baseUrl]
import { chromium, webkit, devices } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3100";
const cases = [
  { name: "iPhone Safari", engine: webkit, ctx: devices["iPhone 15"] },
  { name: "Android Chrome, 4G mobile data", engine: chromium, ctx: devices["Pixel 7"], conn: { effectiveType: "4g", saveData: false } },
  { name: "Android Chrome, 3G mobile data", engine: chromium, ctx: devices["Pixel 7"], conn: { effectiveType: "3g", saveData: false } },
  { name: "Autoplay blocked (Low Power Mode)", engine: webkit, ctx: devices["iPhone 15"], block: true },
  { name: "Save-Data on", engine: chromium, ctx: devices["Pixel 7"], conn: { effectiveType: "4g", saveData: true } },
  { name: "2G connection", engine: chromium, ctx: devices["Pixel 7"], conn: { effectiveType: "2g", saveData: false } },
  { name: "Reduce motion", engine: webkit, ctx: { ...devices["iPhone 15"], reducedMotion: "reduce" } },
];
const rows = [];
for (const c of cases) {
  const b = await c.engine.launch();
  const ctx = await b.newContext(c.ctx);
  if (c.conn) await ctx.addInitScript((conn) => Object.defineProperty(navigator, "connection", { get: () => conn }), c.conn);
  if (c.block) await ctx.addInitScript(() => { HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException("blocked", "NotAllowedError")); }; });
  const p = await ctx.newPage();
  await p.goto(`${base}/en`, { waitUntil: "load" });
  await p.waitForTimeout(3000);
  rows.push({ case: c.name, ...(await p.evaluate(() => {
    const v = document.querySelector("section video");
    const kb = document.querySelector(".hero-kenburns");
    return {
      video: v ? (v.paused ? "present, paused" : "playing") : "not used",
      attrs: v ? ["muted", "playsinline", "autoplay", "loop"].filter((a) => v.hasAttribute(a)).join(" ") + (v.muted ? " (muted=true)" : "") : "-",
      videoVisible: v ? getComputedStyle(v).opacity : "-",
      photoAnimation: kb ? getComputedStyle(kb).animationName : "-",
    };
  })) });
  await b.close();
}
console.table(rows);
