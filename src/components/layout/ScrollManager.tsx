"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SWITCH_ATTR, hasPendingPlace, justSwitched, restorePlace } from "@/lib/locale-anchor";

/** Jump to the very top without the global `scroll-behavior: smooth` animating it. */
export function scrollToTopInstant() {
  const html = document.documentElement;
  const prev = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  html.style.scrollBehavior = prev;
}

/**
 * Every link click to another page (logo, menu, footer, room cards…) opens that page at the very top.
 *
 * Why this exists: Next.js 16 scrolls a new page into view by calling scrollIntoView on each of the
 * segment's top-level elements. On the home page (full-height hero + many sections) that can leave the
 * page part-way down instead of at the hero. We reset to 0 after Next has done its own scrolling.
 *
 * Only navigations started by clicking an internal link count. That leaves alone, on purpose:
 *  • Back / Forward — the browser restores the previous position. (Detecting these via `popstate` is
 *    unreliable: Safari can deliver it after the new page has rendered.)
 *  • Links with a #hash — they land on their anchor.
 *  • The first load / reload, query-only changes (e.g. filters) and new-tab clicks.
 *  • Language switches (links marked data-locale-switch) — they keep the visitor's place instead,
 *    see src/lib/locale-anchor.ts.
 */
const USER_INPUT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

export function ScrollManager() {
  const pathname = usePathname();
  const pending = useRef(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.hasAttribute("data-locale-switch")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.hash || url.pathname === window.location.pathname) return;
      pending.current = true;
    };
    // bubble phase: links that cancel their own navigation (e.g. Book buttons opening the drawer) are skipped
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Language switch: put the same content back under the header before the new language is painted.
  // Any other page change ends the "just switched language" state, so entrance animations work again.
  useLayoutEffect(() => {
    if (hasPendingPlace()) restorePlace();
    else if (!justSwitched()) document.documentElement.removeAttribute(SWITCH_ATTR);
  }, [pathname]);

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    scrollToTopInstant();
    // Next's own scrolling can land a little later (e.g. while a page streams in), so for a short moment
    // after arriving keep the page at the top — until the visitor scrolls, touches or uses the keyboard.
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", hold);
      for (const t of USER_INPUT) window.removeEventListener(t, stop);
    };
    const hold = () => { if (window.scrollY !== 0) scrollToTopInstant(); };
    const timer = setTimeout(stop, 800);
    window.addEventListener("scroll", hold, { passive: true });
    for (const t of USER_INPUT) window.addEventListener(t, stop, { passive: true, once: true });
    requestAnimationFrame(hold);
    return stop;
  }, [pathname]);

  return null;
}
