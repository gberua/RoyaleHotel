"use client";
import { useEffect } from "react";

declare global { interface Window { __reveal?: boolean } }

/**
 * Scroll reveals for every browser (IntersectionObserver). Content is only ever hidden while the
 * `js-reveal` class is on <html> (set by the inline head script); if this component never runs
 * (JS error, blocked scripts) the head script removes that class shortly after the page has loaded, so nothing
 * stays invisible. Elements already on screen are revealed immediately.
 */
export function RevealObserver() {
  useEffect(() => {
    window.__reveal = true;
    const root = document.documentElement;
    if (!("IntersectionObserver" in window)) { root.classList.remove("js-reveal"); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("is-revealed"); io.unobserve(e.target); }
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.01 });
    const watch = (scope: ParentNode) => scope.querySelectorAll<HTMLElement>(".reveal:not(.is-revealed)").forEach((el) => {
      // anything already scrolled past (page opened at an anchor / restored scroll) shows at once
      if (el.getBoundingClientRect().bottom < 0) el.classList.add("is-revealed");
      else io.observe(el);
    });
    watch(document);
    // pages rendered later by client-side navigation
    const mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) { if (n.matches(".reveal")) watch(n.parentElement ?? document); else watch(n); } }); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}
