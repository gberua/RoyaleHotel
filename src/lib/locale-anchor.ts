/**
 * Keep the visitor's place when the language changes.
 *
 * Texts have different lengths in each language, so restoring the pixel position would land somewhere else.
 * Instead, before switching we remember WHICH block element sits under the header line (as a path of child
 * indexes — every language renders the same components, so the path is the same) and how far into it the line
 * falls. After the new language has rendered we scroll so that the same element is at the same spot again.
 * Purely vertical, so it works the same for right-to-left languages.
 */

type Anchor =
  | { kind: "top" }
  | { kind: "bottom" }
  | { kind: "element"; top: string; path: number[]; line: number; ratio: number; gap: number; contained: boolean };

let pending: { anchor: Anchor; at: number } | null = null;
let restoredAt = 0;

/** Attribute on <html> while the page is showing a just-switched language: entrance animations stay off. */
export const SWITCH_ATTR = "data-locale-switch";

const NOT_CONTENT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "LINK", "META", "NEXT-ROUTE-ANNOUNCER"]);

/** Block-level, visible, in-flow children (display:contents wrappers are looked through). */
function blockChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (const c of Array.from(el.children)) {
    if (NOT_CONTENT.has(c.tagName)) continue;
    const cs = getComputedStyle(c);
    if (cs.display === "contents") { out.push(...blockChildren(c)); continue; }
    if (cs.display === "none" || cs.position === "fixed" || cs.display.startsWith("inline")) continue;
    out.push(c);
  }
  return out;
}

/** Where the visible page starts: just under the fixed header. Computed from the header's resting height
 *  (SiteHeader: h-20 at the top, h-16 once scrolled past 40px) rather than measured, because a switch from
 *  the open menu happens while the header is taller — the page under it hasn't moved. */
function headerLine() {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round((window.scrollY > 40 ? 4 : 5) * rem) + 1;
}

function capture(): Anchor {
  const doc = document.documentElement;
  if (window.scrollY < 2) return { kind: "top" };
  if (window.scrollY + window.innerHeight >= doc.scrollHeight - 2) return { kind: "bottom" };
  const line = headerLine();
  const path: number[] = [];
  let el: Element = document.body;
  let rect = el.getBoundingClientRect();
  let contained = true;
  let top = "";
  for (;;) {
    const kids = blockChildren(el);
    let i = kids.findIndex((k) => { const r = k.getBoundingClientRect(); return r.height > 0 && r.top <= line && r.bottom > line; });
    let below = false;
    // the line falls in a gap (margin) between blocks: take the next block below it
    if (i < 0) { i = kids.findIndex((k) => { const r = k.getBoundingClientRect(); return r.height > 0 && r.top > line; }); below = true; }
    if (i < 0) break;
    // <body>'s own children are matched by identity (main#main, footer…): when Next brings back a language
    // it has shown before, it re-inserts that tree after its scripts, so their order is not stable.
    if (el === document.body) top = topKey(kids[i]);
    else path.push(i);
    el = kids[i];
    rect = el.getBoundingClientRect();
    if (below) { contained = false; break; }
  }
  return {
    kind: "element", top, path, line, contained,
    ratio: rect.height ? (line - rect.top) / rect.height : 0,
    gap: rect.top - line,
  };
}

const topKey = (el: Element) => el.tagName + (el.id ? "#" + el.id : "");

function resolve(top: string, path: number[]) {
  const start = blockChildren(document.body).find((c) => topKey(c) === top);
  if (!start) return document.body;
  let el: Element = start;
  for (const i of path) {
    const next = blockChildren(el)[i];
    if (!next) break; // structure differs here: the deepest matching ancestor is still the right area
    el = next;
  }
  return el;
}

function scrollInstant(top: number) {
  const html = document.documentElement;
  const prev = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto"; // the site uses smooth scrolling; this must not animate
  window.scrollTo(0, Math.max(0, top));
  html.style.scrollBehavior = prev;
}

function apply(a: Anchor) {
  if (a.kind === "top") return scrollInstant(0);
  if (a.kind === "bottom") return scrollInstant(document.documentElement.scrollHeight);
  const r = resolve(a.top, a.path).getBoundingClientRect();
  const y = a.contained ? r.top + a.ratio * r.height : r.top - a.gap;
  if (Math.abs(y - a.line) >= 1) scrollInstant(window.scrollY + (y - a.line));
}

/** Call right before navigating to the other language. */
export function rememberPlace() {
  pending = { anchor: capture(), at: Date.now() };
  document.documentElement.setAttribute(SWITCH_ATTR, "");
}

export function hasPendingPlace() {
  return !!pending && Date.now() - pending.at < 10_000;
}

/** True while a language switch is being shown (also covers effects that React runs twice in development). */
export function justSwitched() {
  return hasPendingPlace() || Date.now() - restoredAt < 2000;
}

const USER_INPUT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Call once the new language has rendered (layout effect, before paint). Re-applies for a moment while
 * late content (images, fonts, streamed parts) changes heights — until the visitor scrolls or touches.
 */
export function restorePlace(): () => void {
  if (!pending) return () => {};
  const { anchor } = pending;
  pending = null;
  restoredAt = Date.now();
  document.documentElement.setAttribute(SWITCH_ATTR, "");
  apply(anchor);
  let raf = 0;
  const again = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => apply(anchor)); };
  const ro = new ResizeObserver(again);
  ro.observe(document.body);
  document.fonts?.ready.then(again);
  const stop = () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    ro.disconnect();
    for (const t of USER_INPUT) window.removeEventListener(t, stop);
  };
  const timer = setTimeout(stop, 1500);
  for (const t of USER_INPUT) window.addEventListener(t, stop, { passive: true, once: true });
  return stop;
}
