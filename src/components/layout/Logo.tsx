/**
 * Typographic wordmark — the brand stays "Royale" in every language (like any hotel brand).
 * Replace with an SVG logo via Settings → Media → Logo when one is designed.
 */
export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span className={`flex flex-col items-start leading-none ${tone === "light" ? "text-white" : "text-ink-900"}`}>
      <span className="font-display text-[1.55rem] uppercase tracking-[0.12em] sm:text-[2rem] sm:tracking-[0.14em]">
        Royale
      </span>
      <span className={`mt-0.5 text-[0.5rem] font-semibold uppercase tracking-[0.4em] sm:text-[0.56rem] sm:tracking-[0.5em] ${tone === "light" ? "text-white/80" : "text-sea-700"}`}>
        Hotel · Kobuleti
      </span>
    </span>
  );
}
