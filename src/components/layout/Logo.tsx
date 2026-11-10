/**
 * Typographic wordmark — the brand stays "Royale" in every language (like any hotel brand).
 * Replace with an SVG logo via Settings → Media → Logo when one is designed.
 */
export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    // Both lines share one centre axis. letter-spacing also adds space after the LAST letter, so each line
    // gets a negative right margin equal to its tracking — the visible letters, not the boxes, are centred.
    // inline-flex keeps the lockup as wide as its longest line, so its position in header/footer is unchanged.
    <span className={`inline-flex flex-col items-center leading-none ${tone === "light" ? "text-white" : "text-ink-900"}`}>
      <span className="-mr-[0.12em] font-display text-[1.55rem] uppercase tracking-[0.12em] sm:-mr-[0.14em] sm:text-[2rem] sm:tracking-[0.14em]">
        Royale
      </span>
      <span className={`mt-0.5 -mr-[0.4em] text-[0.5rem] font-semibold uppercase tracking-[0.4em] sm:-mr-[0.5em] sm:text-[0.56rem] sm:tracking-[0.5em] ${tone === "light" ? "text-white/80" : "text-sea-700"}`}>
        Hotel · Kobuleti
      </span>
    </span>
  );
}
