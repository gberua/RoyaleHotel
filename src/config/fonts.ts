/**
 * ─────────────────────────────── FONTS — single config file ───────────────────────────────
 *
 * DISPLAY (headings, logo)
 *   1. "Royale Display" — the licensed custom face (e.g. Narcissus). To install it, drop the
 *      .woff2 files into  public/fonts/display/  and restart / rebuild. They are picked up
 *      automatically by scripts/fonts.mjs (file names containing Light/Regular/Medium/
 *      SemiBold/Bold set the weight). It applies to Georgian characters only, because
 *      Narcissus is a Georgian-only face — Latin/Cyrillic keep using the fallback below.
 *   2. Noto Serif Georgian, pinned at 72 % width — the free (SIL OFL) stand-in chosen because
 *      it is the closest licensed match to the reference: tall, condensed, high-contrast serif.
 *   3. Noto Serif Display, pinned at 72 % width — the matching Latin + Cyrillic display face.
 *
 * BODY (text, prices, forms, admin)
 *   Noto Sans Georgian + Noto Sans (Latin, Cyrillic) — one design family, very legible, 400/500/600.
 *
 * Files in src/fonts/ are static, subset WOFF2 instances built by scripts/build-fonts.py
 * (≈15–22 KB each instead of ≈350 KB of variable fonts). Self-hosted, font-display: swap.
 */
import localFont from "next/font/local";

// Georgian ranges (must be written literally — next/font requires literal options)
const displayGeorgian = localFont({
  src: "../fonts/display-ka-400.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-display-ka",
  declarations: [{ prop: "unicode-range", value: "U+10A0-10FF, U+1C90-1CBF, U+2D00-2D2F, U+0020, U+00A0, U+20BE" }],
  // No fallback here: a fallback face has no unicode-range and would swallow Latin/Cyrillic
  // before the Latin family gets a chance. The full chain is built in globals.css.
  adjustFontFallback: false,
  fallback: [],
});

const displayLatin = localFont({
  src: "../fonts/display-latin-400.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-display-latin",
  preload: false,
  fallback: ["Georgia", "serif"],
});

const bodyGeorgian = localFont({
  src: [
    { path: "../fonts/body-ka-400.woff2", weight: "400" },
    { path: "../fonts/body-ka-500.woff2", weight: "500" },
    { path: "../fonts/body-ka-600.woff2", weight: "600" },
  ],
  display: "swap",
  variable: "--font-body-ka",
  declarations: [{ prop: "unicode-range", value: "U+10A0-10FF, U+1C90-1CBF, U+2D00-2D2F, U+0020, U+00A0, U+20BE" }],
  adjustFontFallback: false,
  fallback: [],
});

const bodyLatin = localFont({
  src: [
    { path: "../fonts/body-latin-400.woff2", weight: "400" },
    { path: "../fonts/body-latin-500.woff2", weight: "500" },
    { path: "../fonts/body-latin-600.woff2", weight: "600" },
  ],
  display: "swap",
  variable: "--font-body-latin",
  fallback: ["system-ui", "sans-serif"],
});

/** Class names that expose the CSS variables used by the design tokens in globals.css */
export const fontVariables = [displayGeorgian, displayLatin, bodyGeorgian, bodyLatin].map((f) => f.variable).join(" ");

/**
 * Width applied to headings. The fallback files are already condensed, so this stays "normal".
 * If the licensed display face ships as a variable font with a width axis, adjust it here.
 */
export const DISPLAY_FONT_STRETCH = "normal";
